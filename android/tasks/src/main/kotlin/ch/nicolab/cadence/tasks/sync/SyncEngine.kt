package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.tasks.model.TodoMdRepos
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Entités synchronisées, dans l'ordre de l'instantané (les références passent avant). */
internal val SYNCED_ENTITIES = listOf("area", "goal", "project", "tag", "note", "task", "inbox_item", "link")

private const val PAGE_SIZE = 500
private const val PUSH_BATCH = 500

/** Envois de plus d'une opération refaits par moitiés pour isoler celle qui fait échouer le lot. */
private const val MAX_ISOLATION_REQUESTS = 24

data class SyncState(
    val running: Boolean = false,
    val lastError: String? = null,
    /** Entités du téléphone que le serveur ne connaît pas (serveur plus ancien) : leurs écritures attendent. */
    val unsupported: List<String> = emptyList(),
)

sealed interface SyncResult {
    data object Synced : SyncResult

    /** Serveur non atteint (réseau, adresse, délai) : les opérations restent dans la file, on réessaie plus tard. */
    data class Offline(val reason: String?) : SyncResult

    /** Le serveur a répondu par une erreur ([message] la nomme) : réessayé plus tard, sans perdre la file. */
    data class Failed(val message: String) : SyncResult

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
    /** Entités du passage, les références d'abord : tâches seules, ou tâches et habitudes. */
    private val entities: List<String> = SYNCED_ENTITIES,
    /** Après un passage réussi : relectures en ligne qui ne passent pas par le journal (plan du jour). */
    private val onSynced: suspend () -> Unit = {},
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
            val report = PassReport()
            val result = try {
                runPass(report)
                SyncResult.Synced
            } catch (error: SessionClosed) {
                SyncResult.Closed
            } catch (error: AuthError) {
                SyncResult.Unauthorized
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                // Toute erreur, réseau, HTTP ou réponse illisible, finit en message précis : jamais en plantage.
                if (isUnreachable(error)) SyncResult.Offline(describeFailure(error)) else SyncResult.Failed(describeFailure(error))
            } finally {
                _state.update { it.copy(running = false) }
            }
            if (result != SyncResult.Closed) {
                _state.update { it.copy(lastError = result.errorMessage(report), unsupported = report.unsupported) }
            }
            if (result == SyncResult.Synced) {
                try {
                    onSynced()
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    // Une relecture annexe ne fait pas échouer la synchro.
                }
            }
            result
        }
    }

    private suspend fun runPass(report: PassReport) {
        checkOpen()
        onProfile(api.profile())
        // Un serveur plus ancien ne connaît pas toutes nos entités : on ne lui demande que les siennes.
        val catalog = ServerCatalog.of(api.meta())
        val active = entities.filter(catalog::knows)
        report.unsupported = entities - active.toSet()
        if (store.cursor() == null) snapshotAll(active) else catchUp(active)
        pushAndReconcile(catalog, report)
        replayDeferredCalls(report)
        try {
            pullAll(active)
        } catch (reset: ResetRequired) {
            // Le journal compacté ne remonte plus jusqu'au curseur : on repart d'un instantané. La file
            // d'envoi reste intacte (ses lignes sont réappliquées sur l'instantané) et repart avant le tirage.
            checkOpen()
            store.saveCursor(null)
            snapshotAll(active)
            pushAndReconcile(catalog, report)
            pullAll(active)
        }
        checkOpen()
        store.markSynced(nowMs())
    }

    /** Envoie la file, relit les entités en conflit ou rejetées, et note les conflits perdus. */
    private suspend fun pushAndReconcile(catalog: ServerCatalog, report: PassReport) {
        val pushed = pushPending(catalog)
        report.rejected += pushed.rejected.size
        report.rejectedReasons += pushed.rejectedReasons
        report.heldByError += pushed.heldByError
        // Un conflit ou un rejet n'émet aucun changement : on relit l'entité pour
        // montrer la valeur qui a gagné côté serveur.
        val seen = mutableSetOf<Pair<String, String>>()
        val conflicted = pushed.conflicts.map { it.op.entity to it.op.uid }.toSet()
        val serverRows = mutableMapOf<Pair<String, String>, JsonObject>()
        pushed.stale.filter(catalog::knows).forEach { entity ->
            downloadEntity(entity, seen) { row ->
                val key = entity to row.uid()
                if (key in conflicted) serverRows[key] = row
            }
        }
        for (conflict in pushed.conflicts) {
            val key = conflict.op.entity to conflict.op.uid
            val fields = conflict.op.payload["fields"] as? JsonObject ?: continue
            for (field in conflict.fields) {
                val local = (fields[field] as? JsonObject)?.get("value") ?: JsonNull
                checkOpen()
                store.recordConflict(
                    ConflictRecord(conflict.op.entity, conflict.op.uid, field, local, serverRows[key]?.get(field), conflict.op.opId),
                )
            }
        }
        // Une création rejetée que le serveur ne connaît pas n'a plus de raison d'exister localement.
        pushed.rejected
            .filter { (it.entity to it.uid) !in seen && store.discardsRejectedCreation(it.entity) }
            .forEach {
                checkOpen()
                store.deleteRow(it.entity, it.uid)
            }
    }

    private suspend fun snapshotAll(active: List<String>) {
        checkOpen()
        store.clearSyncedRows()
        var cursor: Long? = null
        for (entity in active) {
            val firstCursor = downloadEntity(entity)
            cursor = cursor ?: firstCursor
        }
        checkOpen()
        store.saveCursor(cursor)
        store.saveSnapshottedEntities(active.toSet())
    }

    /**
     * Une entité que le serveur vient d'apprendre (mis à jour après le téléphone) n'a jamais été reçue :
     * on la télécharge seule, sans jeter le curseur ; le tirage qui suit rejoue ses changements récents.
     */
    private suspend fun catchUp(active: List<String>) {
        val received = store.snapshottedEntities() ?: active.toSet().also { store.saveSnapshottedEntities(it) }
        val missing = active.filter { it !in received }
        if (missing.isEmpty()) return
        missing.forEach { downloadEntity(it) }
        checkOpen()
        store.saveSnapshottedEntities(received + missing)
    }

    /** Télécharge toutes les pages d'une entité ; retourne le curseur de la première page. */
    private suspend fun downloadEntity(
        entity: String,
        seen: MutableSet<Pair<String, String>>? = null,
        onRow: (JsonObject) -> Unit = {},
    ): Long {
        checkOpen()
        val first = api.snapshot(entity, after = 0, cursor = null, limit = PAGE_SIZE)
        applyRows(entity, first.rows, seen, onRow)
        var page = first
        while (true) {
            val next = page.next ?: return first.cursor
            checkOpen()
            // Le curseur de la première page borne les changements à rejouer ensuite.
            page = api.snapshot(entity, after = next, cursor = first.cursor, limit = PAGE_SIZE)
            applyRows(entity, page.rows, seen, onRow)
        }
    }

    private suspend fun applyRows(
        entity: String,
        rows: List<JsonObject>,
        seen: MutableSet<Pair<String, String>>?,
        onRow: (JsonObject) -> Unit,
    ) {
        rows.forEach { row ->
            checkOpen()
            observeClocks(row)
            store.applyServerRow(entity, row)
            onRow(row)
            seen?.add(entity to row.uid())
        }
    }

    /**
     * Envoie la file par lots, dans l'ordre. Une opération que le serveur ne saurait pas lire (entité ou champ
     * qu'il ne connaît pas) reste dans la file, avec toutes les suivantes de la même ligne ; les autres partent.
     */
    private suspend fun pushPending(catalog: ServerCatalog): Pushed {
        val pushed = Pushed()
        val held = mutableSetOf<String>()
        val heldRows = mutableSetOf<Pair<String, String>>()
        val budget = intArrayOf(MAX_ISOLATION_REQUESTS)
        while (true) {
            checkOpen()
            val batch = store.pendingOps(PUSH_BATCH + held.size).filter { it.opId !in held }.take(PUSH_BATCH)
            if (batch.isEmpty()) return pushed
            val sendable = mutableListOf<OutboxOp>()
            val waiting = mutableListOf<OutboxOp>()
            for (op in batch) {
                val row = op.entity to op.uid
                if (row in heldRows || !catalog.accepts(op)) {
                    waiting += op
                    heldRows += row
                } else {
                    sendable += op
                }
            }
            held += waiting.map { it.opId }
            if (waiting.isNotEmpty()) {
                checkOpen()
                store.recordFailure(waiting.map { it.opId }, "En attente : le serveur ne connaît pas encore ce type de donnée")
            }
            if (sendable.isEmpty()) continue
            val sent = try {
                pushIsolating(sendable, heldRows, budget)
            } catch (error: Exception) {
                if (error is CancellationException || error is SessionClosed) throw error
                checkOpen()
                store.recordFailure(sendable.map { it.opId }, describeFailure(error))
                throw error
            }
            sent.held.forEach { (op, message) ->
                held += op.opId
                heldRows += op.entity to op.uid
                pushed.heldByError += 1
                checkOpen()
                store.recordFailure(listOf(op.opId), message)
            }
            val byId = sent.results.associateBy { it.opId }
            val answered = sendable.filter { it.opId in byId }
            for (op in answered) {
                val result = byId.getValue(op.opId)
                if (result.status == "applied") continue
                pushed.stale += op.entity
                when (result.status) {
                    "rejected" -> {
                        checkOpen()
                        store.recordRejected(op, result.reason)
                        pushed.rejected += op
                        pushed.rejectedReasons += result.reason
                    }
                    "conflict" -> if (result.rejectedFields.isNotEmpty()) pushed.conflicts += Conflict(op, result.rejectedFields)
                }
            }
            checkOpen()
            store.removeOps(answered.map { it.opId })
            // Une opération sans réponse reste dans la file : la renvoyer en boucle ne servirait à rien.
            val unanswered = sendable.size - answered.size - sent.held.size
            if (unanswered > 0) return pushed
        }
    }

    /**
     * Un lot refusé en bloc (HTTP 4xx/500) est renvoyé par moitiés : une seule opération illisible ne retient
     * plus toute la file. Seule, une opération refusée en 4xx est rejetée ; en 500, elle reste en file (avec
     * les suivantes de sa ligne) et les autres partent. Une panne générale (502, 503, 504, 429) arrête l'envoi.
     */
    private suspend fun pushIsolating(
        ops: List<OutboxOp>,
        heldRows: MutableSet<Pair<String, String>>,
        budget: IntArray,
    ): Sent {
        val ready = ops.filter { (it.entity to it.uid) !in heldRows }
        val blocked = ops.filter { (it.entity to it.uid) in heldRows }.map { it to "En attente d'une modification précédente" }
        if (ready.isEmpty()) return Sent(emptyList(), blocked)
        try {
            return Sent(api.push(ready.map { it.payload }), blocked)
        } catch (error: HttpError) {
            if (error.isUnavailable || error.code == 404) throw error
            if (ready.size == 1) {
                val op = ready.single()
                if (error.isClientError) {
                    return Sent(listOf(PushResult(op.opId, "rejected", "http_${error.code}" + (error.error?.let { ":$it" } ?: ""))), blocked)
                }
                heldRows += op.entity to op.uid
                return Sent(emptyList(), blocked + (op to describeFailure(error)))
            }
            if (budget[0] <= 0) throw error
            budget[0] -= 1
            val half = ready.size / 2
            val first = pushIsolating(ready.subList(0, half), heldRows, budget)
            val second = pushIsolating(ready.subList(half, ready.size), heldRows, budget)
            return Sent(first.results + second.results, blocked + first.held + second.held)
        }
    }

    /** Rejoue les appels faits hors ligne (revue, routine, occurrence déplacée), dans leur ordre. */
    private suspend fun replayDeferredCalls(report: PassReport) {
        for (call in store.deferredCalls()) {
            checkOpen()
            try {
                api.send(call.method, call.path, call.body)
                checkOpen()
                store.removeDeferredCall(call.key)
            } catch (error: HttpError) {
                checkOpen()
                when {
                    error.isUnavailable -> throw error
                    error.code < 500 -> {
                        store.rejectDeferredCall(call, describeFailure(error))
                        report.rejected += 1
                    }
                    else -> {
                        store.failDeferredCall(call, describeFailure(error))
                        report.heldByError += 1
                    }
                }
            }
        }
    }

    private suspend fun pullAll(active: List<String>) {
        var cursor = store.cursor() ?: return
        do {
            checkOpen()
            val page = api.pull(cursor, PAGE_SIZE)
            page.changes.forEach { change ->
                checkOpen()
                applyChange(change, active)
            }
            cursor = page.cursor
            checkOpen()
            // Le curseur avance après chaque page : une page rejouée après une coupure reste sans effet.
            store.saveCursor(cursor)
            store.saveClock(hlc.state())
        } while (page.hasMore)
    }

    /** Un changement d'une entité que le téléphone ne connaît pas (serveur plus récent) est ignoré. */
    private suspend fun applyChange(change: RemoteChange, active: List<String>) {
        if (change.entity !in active) return
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

    private fun SyncResult.errorMessage(report: PassReport): String? = when (this) {
        SyncResult.Synced -> when {
            // Un refus d'un dépôt TODO.md dit sa cause (ligne changée, dépôt injoignable) au lieu d'un simple compte.
            report.rejected > 0 && TodoMdRepos.rejectionSummary(report.rejectedReasons) != null ->
                TodoMdRepos.rejectionSummary(report.rejectedReasons)
            report.rejected == 1 -> "1 modification refusée par le serveur"
            report.rejected > 1 -> "${report.rejected} modifications refusées par le serveur"
            report.heldByError == 1 -> "1 modification en attente : erreur du serveur, nouvel essai plus tard"
            report.heldByError > 1 -> "${report.heldByError} modifications en attente : erreur du serveur, nouvel essai plus tard"
            else -> null
        }
        is SyncResult.Offline -> reason ?: "Serveur injoignable"
        is SyncResult.Failed -> message
        SyncResult.Unauthorized -> "Clé API refusée"
        SyncResult.Closed -> null
    }

    private fun JsonObject.uid(): String = getValue("uid").jsonPrimitive.content

    private class PassReport {
        var rejected = 0
        val rejectedReasons = mutableListOf<String?>()
        var heldByError = 0
        var unsupported: List<String> = emptyList()
    }

    private class Conflict(val op: OutboxOp, val fields: List<String>)

    private class Pushed {
        val stale = mutableSetOf<String>()
        val rejected = mutableListOf<OutboxOp>()
        val rejectedReasons = mutableListOf<String?>()
        val conflicts = mutableListOf<Conflict>()
        var heldByError = 0
    }

    private class Sent(val results: List<PushResult>, val held: List<Pair<OutboxOp, String>>)

    private class SessionClosed : Exception("Session fermée")
}
