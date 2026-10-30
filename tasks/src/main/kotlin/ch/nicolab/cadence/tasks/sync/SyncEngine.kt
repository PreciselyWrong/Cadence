package ch.nicolab.cadence.tasks.sync

import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

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
    private val _state = MutableStateFlow(SyncState())
    val state: StateFlow<SyncState> = _state.asStateFlow()

    suspend fun sync(): SyncResult = mutex.withLock {
        _state.update { it.copy(running = true) }
        val result = try {
            runPass()
            SyncResult.Synced
        } catch (error: AuthError) {
            SyncResult.Unauthorized
        } catch (error: IOException) {
            SyncResult.Offline(error.message)
        } finally {
            _state.update { it.copy(running = false) }
        }
        _state.update { it.copy(lastError = result.errorMessage()) }
        result
    }

    private suspend fun runPass() {
        onProfile(api.profile())
        if (store.cursor() == null) snapshotAll()
        val stale = pushPending()
        // Un conflit ou un rejet n'émet aucun changement : on relit l'entité pour
        // montrer la valeur qui a gagné côté serveur.
        stale.forEach { downloadEntity(it) }
        pullAll()
        store.markSynced(nowMs())
    }

    private suspend fun snapshotAll() {
        store.clearSyncedRows()
        var cursor: Long? = null
        for (entity in SYNCED_ENTITIES) {
            val firstCursor = downloadEntity(entity)
            cursor = cursor ?: firstCursor
        }
        store.saveCursor(cursor)
    }

    /** Télécharge toutes les pages d'une entité ; retourne le curseur de la première page. */
    private suspend fun downloadEntity(entity: String): Long {
        val first = api.snapshot(entity, after = 0, cursor = null, limit = PAGE_SIZE)
        applyRows(entity, first.rows)
        var page = first
        while (true) {
            val next = page.next ?: return first.cursor
            // Le curseur de la première page borne les changements à rejouer ensuite.
            page = api.snapshot(entity, after = next, cursor = first.cursor, limit = PAGE_SIZE)
            applyRows(entity, page.rows)
        }
    }

    private suspend fun applyRows(entity: String, rows: List<JsonObject>) {
        rows.forEach { row ->
            observeClocks(row)
            store.applyServerRow(entity, row)
        }
    }

    /**
     * Envoie la file par lots, dans l'ordre. Retourne les entités à relire : celles
     * dont une opération a été en conflit ou rejetée.
     */
    private suspend fun pushPending(): Set<String> {
        val stale = mutableSetOf<String>()
        while (true) {
            val ops = store.pendingOps(PUSH_BATCH)
            if (ops.isEmpty()) return stale
            val results = try {
                api.push(ops.map { it.payload })
            } catch (error: IOException) {
                store.recordFailure(ops.map { it.opId }, error.message ?: "Erreur réseau")
                throw error
            }
            val byId = results.associateBy { it.opId }
            val answered = ops.filter { it.opId in byId }
            for (op in answered) {
                val result = byId.getValue(op.opId)
                if (result.status == "applied") continue
                stale += op.entity
                if (result.status == "rejected") store.recordRejected(op, result.reason)
            }
            store.removeOps(answered.map { it.opId })
            // Une opération sans réponse reste dans la file : la renvoyer en boucle ne servirait à rien.
            if (answered.size < ops.size) return stale
        }
    }

    private suspend fun pullAll() {
        var cursor = store.cursor() ?: return
        do {
            val page = api.pull(cursor, PAGE_SIZE)
            page.changes.forEach { applyChange(it) }
            cursor = page.cursor
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

    private fun observeClocks(row: JsonObject) {
        val clocks = row["field_clocks"] as? JsonObject ?: return
        clocks.values.forEach { clock ->
            (clock as? JsonPrimitive)?.contentOrNull?.let(hlc::observe)
        }
    }

    private fun SyncResult.errorMessage(): String? = when (this) {
        SyncResult.Synced -> null
        is SyncResult.Offline -> "Serveur injoignable"
        SyncResult.Unauthorized -> "Clé API refusée"
    }
}
