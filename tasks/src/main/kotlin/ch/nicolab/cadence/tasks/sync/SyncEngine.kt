package ch.nicolab.cadence.tasks.sync

import java.io.IOException
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Entités synchronisées, dans l'ordre de l'instantané (les références passent avant). */
internal val SYNCED_ENTITIES = listOf("area", "project", "tag", "task", "inbox_item")

private const val PAGE_SIZE = 500
private const val PUSH_BATCH = 500

data class SyncState(val running: Boolean = false, val lastError: String? = null)

sealed interface SyncResult {
    data object Synced : SyncResult

    /** Réseau indisponible : les opérations restent dans la file, on réessaie plus tard. */
    data class Offline(val reason: String?) : SyncResult

    data object Unauthorized : SyncResult

    /** La session a été fermée (déconnexion) pendant le passage : plus rien n'a été écrit. */
    data object Closed : SyncResult
}

/**
 * Un passage de synchronisation : instantané si aucun curseur, envoi de la file,
 * puis tirage des changements. Un seul passage à la fois.
 */
class SyncEngine(
    private val api: SyncApi,
    private val store: SyncStore,
    private val hlc: Hlc,
    /** Reçoit le profil à chaque passage : le fuseau du compte peut changer côté web. */
    private val onProfile: suspend (AccountProfile) -> Unit = {},
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    private val mutex = Mutex()
    private val generation = AtomicLong(0)
    /** Génération du passage en cours : dès qu'elle ne correspond plus, le passage cesse d'écrire. */
    private var passGeneration = 0L
    private val _state = MutableStateFlow(SyncState())
    val state: StateFlow<SyncState> = _state.asStateFlow()

    /**
     * Ferme la session courante : un passage en cours s'arrête avant sa prochaine écriture.
     * Attendre ensuite [whileIdle] garantit qu'aucune ligne ne revient après l'effacement.
     */
    fun markClosed() {
        generation.incrementAndGet()
    }

    /** Exécute [block] sans passage en cours. */
    suspend fun <T> whileIdle(block: suspend () -> T): T = mutex.withLock { block() }

    suspend fun sync(): SyncResult {
        val requested = generation.get()
        return mutex.withLock {
            passGeneration = requested
            _state.update { it.copy(running = true) }
            var rejected = 0
            val result = try {
                rejected = runPass()
                SyncResult.Synced
            } catch (error: SessionClosed) {
                SyncResult.Closed
            } catch (error: AuthError) {
                SyncResult.Unauthorized
            } catch (error: IOException) {
                SyncResult.Offline(error.message)
            } finally {
                _state.update { it.copy(running = false) }
            }
            if (result != SyncResult.Closed) {
                _state.update { it.copy(lastError = result.errorMessage(rejected)) }
            }
            result
        }
    }

    /** Retourne le nombre d'opérations rejetées par le serveur pendant ce passage. */
    private suspend fun runPass(): Int {
        checkOpen()
        onProfile(api.profile())
        if (store.cursor() == null) snapshotAll()
        val pushed = pushPending()
        // Un conflit ou un rejet n'émet aucun changement : on relit l'entité pour
        // montrer la valeur qui a gagné côté serveur.
        val seen = mutableSetOf<Pair<String, String>>()
        pushed.stale.forEach { downloadEntity(it, seen) }
        // Une création rejetée que le serveur ne connaît pas n'a plus de raison d'exister localement.
        pushed.rejected
            .filter { (it.entity to it.uid) !in seen }
            .forEach {
                checkOpen()
                store.deleteRow(it.entity, it.uid)
            }
        pullAll()
        checkOpen()
        store.markSynced(nowMs())
        return pushed.rejected.size
    }

    private suspend fun snapshotAll() {
        checkOpen()
        store.clearSyncedRows()
        var cursor: Long? = null
        for (entity in SYNCED_ENTITIES) {
            val firstCursor = downloadEntity(entity)
            cursor = cursor ?: firstCursor
        }
        checkOpen()
        store.saveCursor(cursor)
    }

    /** Télécharge toutes les pages d'une entité ; retourne le curseur de la première page. */
    private suspend fun downloadEntity(entity: String, seen: MutableSet<Pair<String, String>>? = null): Long {
        checkOpen()
        val first = api.snapshot(entity, after = 0, cursor = null, limit = PAGE_SIZE)
        applyRows(entity, first.rows, seen)
        var page = first
        while (true) {
            val next = page.next ?: return first.cursor
            checkOpen()
            // Le curseur de la première page borne les changements à rejouer ensuite.
            page = api.snapshot(entity, after = next, cursor = first.cursor, limit = PAGE_SIZE)
            applyRows(entity, page.rows, seen)
        }
    }

    private suspend fun applyRows(entity: String, rows: List<JsonObject>, seen: MutableSet<Pair<String, String>>?) {
        rows.forEach { row ->
            checkOpen()
            observeClocks(row)
            store.applyServerRow(entity, row)
            seen?.add(entity to row.getValue("uid").jsonPrimitive.content)
        }
    }

    /**
     * Envoie la file par lots, dans l'ordre. Retourne les entités à relire (conflit ou rejet)
     * et les opérations rejetées.
     */
    private suspend fun pushPending(): Pushed {
        val stale = mutableSetOf<String>()
        val rejected = mutableListOf<OutboxOp>()
        while (true) {
            checkOpen()
            val ops = store.pendingOps(PUSH_BATCH)
            if (ops.isEmpty()) return Pushed(stale, rejected)
            val results = try {
                api.push(ops.map { it.payload })
            } catch (error: IOException) {
                checkOpen()
                store.recordFailure(ops.map { it.opId }, error.message ?: "Erreur réseau")
                throw error
            }
            val byId = results.associateBy { it.opId }
            val answered = ops.filter { it.opId in byId }
            for (op in answered) {
                val result = byId.getValue(op.opId)
                if (result.status == "applied") continue
                stale += op.entity
                if (result.status == "rejected") {
                    checkOpen()
                    store.recordRejected(op, result.reason)
                    rejected += op
                }
            }
            checkOpen()
            store.removeOps(answered.map { it.opId })
            // Une opération sans réponse reste dans la file : la renvoyer en boucle ne servirait à rien.
            if (answered.size < ops.size) return Pushed(stale, rejected)
        }
    }

    private suspend fun pullAll() {
        var cursor = store.cursor() ?: return
        do {
            checkOpen()
            val page = api.pull(cursor, PAGE_SIZE)
            page.changes.forEach { change ->
                checkOpen()
                applyChange(change)
            }
            cursor = page.cursor
            checkOpen()
            // Le curseur avance après chaque page : une page rejouée après une coupure reste sans effet.
            store.saveCursor(cursor)
            store.saveClock(hlc.state())
        } while (page.hasMore)
    }

    private suspend fun applyChange(change: RemoteChange) {
        if (change.entity !in SYNCED_ENTITIES) return
        when {
            change.op == "delete" -> store.deleteRow(change.entity, change.uid)
            change.data != null -> {
                observeClocks(change.data)
                store.applyServerRow(change.entity, change.data)
            }
        }
    }

    /** Un passage fermé par une déconnexion n'écrit plus rien : on s'arrête avant chaque écriture. */
    private fun checkOpen() {
        if (generation.get() != passGeneration) throw SessionClosed()
    }

    private fun observeClocks(row: JsonObject) {
        val clocks = row["field_clocks"] as? JsonObject ?: return
        clocks.values.forEach { clock ->
            (clock as? JsonPrimitive)?.contentOrNull?.let(hlc::observe)
        }
    }

    private fun SyncResult.errorMessage(rejected: Int): String? = when (this) {
        SyncResult.Synced -> when (rejected) {
            0 -> null
            1 -> "1 modification refusée par le serveur"
            else -> "$rejected modifications refusées par le serveur"
        }
        is SyncResult.Offline -> "Serveur injoignable"
        SyncResult.Unauthorized -> "Clé API refusée"
        SyncResult.Closed -> null
    }

    private class Pushed(val stale: Set<String>, val rejected: List<OutboxOp>)

    private class SessionClosed : Exception("Session fermée")
}
