package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.data.sync.ApplyResult
import ch.nicolab.cadence.data.sync.HabitSyncPlanner
import ch.nicolab.cadence.data.sync.HabitSyncSpecs
import ch.nicolab.cadence.data.sync.HabitSyncStorage
import ch.nicolab.cadence.data.sync.HabitWire
import ch.nicolab.cadence.data.sync.OutboxEntry
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Entités d'habitudes du protocole, parents d'abord. */
internal val HABIT_ENTITIES: List<String> = HabitSyncSpecs.order

/**
 * Côté habitudes du stockage de synchro : relie [HabitSyncStorage] (Room, module `:data`) au moteur.
 * Les écritures à envoyer viennent des déclencheurs SQL, pas d'une file tenue ici.
 *
 * Un rejet n'efface jamais la ligne locale (contrairement aux tâches) : c'est la saisie de la personne,
 * elle reste, le refus est montré avec son motif, et la file ne reboucle pas dessus.
 */
internal class HabitSyncStore(
    private val storage: HabitSyncStorage,
    private val node: String,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val recordFailure: suspend (op: OutboxOp, reason: String?, name: String?) -> Unit,
) {
    /** Les lignes envoyées dont l'acquittement est attendu, pour savoir quoi retirer. */
    private val inFlight = mutableMapOf<String, List<OutboxEntry>>()

    suspend fun pendingOps(limit: Int): List<OutboxOp> {
        if (limit <= 0) return emptyList()
        val plan = HabitSyncPlanner.plan(storage.pendingEntries(limit)) { entity, uid -> storage.row(entity, uid) }
        if (plan.orphans.isNotEmpty()) storage.clear(plan.orphans)
        return plan.ops.take(limit).map { planned ->
            inFlight[planned.opId] = planned.entries
            OutboxOp(
                opId = planned.opId,
                entity = planned.entity,
                uid = planned.uid,
                action = if (planned.delete) "delete" else "upsert",
                payload = planned.toPayload(node),
            )
        }
    }

    /** Acquittées (appliquées, en conflit ou refusées), les écritures sortent de la file ; une plus récente reste. */
    suspend fun removeOps(opIds: List<String>) {
        val known = opIds.mapNotNull { inFlight.remove(it) }.flatten()
        if (known.isNotEmpty()) storage.clear(known)
        if (known.size < opIds.size) {
            // Autre passage ou redémarrage : l'identifiant dérive des écritures, on le retrouve dans la file.
            val wanted = opIds.toSet()
            val byRow = storage.pendingEntries(Int.MAX_VALUE).groupBy { it.entity to it.uid }.values
            byRow.filter { HabitWire.opId(it) in wanted }.forEach { storage.clear(it) }
        }
    }

    suspend fun recordRejected(op: OutboxOp, reason: String?) {
        recordFailure(op, reason, storage.displayName(op.entity, op.uid))
    }

    suspend fun applyServerRow(entity: String, data: JsonObject) {
        raiseFloor(data)
        val result = try {
            storage.apply(entity, data)
        } catch (error: ch.nicolab.cadence.data.sync.MalformedRow) {
            ApplyResult.Skipped(error.message ?: "ligne illisible")
        }
        if (result is ApplyResult.Applied) result.replacedEntryUid?.let { storage.deleteEntry(it) }
    }

    suspend fun deleteRow(entity: String, uid: String) = storage.delete(entity, uid)

    suspend fun markAllDirty() = storage.markAllDirty()

    private suspend fun raiseFloor(data: JsonObject) {
        val clocks = data["field_clocks"] as? JsonObject ?: return
        val limit = nowMs() + MAX_FUTURE_MS
        val highest = clocks.values
            .mapNotNull { ((it as? JsonPrimitive)?.contentOrNull)?.let(HabitWire::hlcMs) }
            .filter { it <= limit }
            .maxOrNull() ?: return
        storage.raiseClockFloor(highest)
    }

    private companion object {
        /** Même garde que `Hlc.observe` : une horloge trop avancée ne doit pas figer les nôtres. */
        const val MAX_FUTURE_MS = 24 * 60 * 60 * 1000L
    }
}
