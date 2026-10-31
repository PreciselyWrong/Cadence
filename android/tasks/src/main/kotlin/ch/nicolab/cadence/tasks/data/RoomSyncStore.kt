package ch.nicolab.cadence.tasks.data

import androidx.room.withTransaction
import ch.nicolab.cadence.tasks.sync.HABIT_ENTITIES
import ch.nicolab.cadence.tasks.sync.HabitSyncStore
import ch.nicolab.cadence.tasks.sync.OutboxOp
import ch.nicolab.cadence.tasks.sync.PendingOverlay
import ch.nicolab.cadence.tasks.sync.SyncStore
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

internal class RoomSyncStore(
    private val database: TududiDatabase,
    private val clockState: ClockStateStore,
    private val nowMs: () -> Long = System::currentTimeMillis,
    /** Habitudes (base `:data`) : absent tant que l'application ne les a pas branchées. */
    private val habits: HabitSyncStore? = null,
) : SyncStore {
    private val meta = database.syncMetaDao()
    private val outbox = database.outboxDao()

    /**
     * Sans le repère des habitudes, le curseur est vu comme absent : une installation qui synchronisait
     * déjà les tâches repart d'un instantané complet, habitudes comprises.
     */
    override suspend fun cursor(): Long? {
        if (habits != null && meta.get(HABITS_SNAPSHOT) == null) return null
        return meta.get(CURSOR)?.toLongOrNull()
    }

    override suspend fun saveCursor(cursor: Long?) {
        if (cursor == null) {
            meta.delete(CURSOR)
            meta.delete(HABITS_SNAPSHOT)
        } else {
            meta.put(SyncMetaEntity(CURSOR, cursor.toString()))
            if (habits != null) meta.put(SyncMetaEntity(HABITS_SNAPSHOT, "1"))
        }
    }

    override fun discardsRejectedCreation(entity: String) = entity !in HABIT_ENTITIES

    override suspend fun serverChanged() {
        habits?.markAllDirty()
    }

    override suspend fun clearSyncedRows() = database.withTransaction {
        database.taskDao().deleteSynced()
        database.projectDao().deleteAll()
        database.areaDao().deleteAll()
        database.tagDao().deleteAll()
        database.noteDao().deleteSynced()
        database.inboxDao().deleteSynced()
    }

    override suspend fun applyServerRow(entity: String, data: JsonObject) {
        if (entity in HABIT_ENTITIES) {
            habits?.applyServerRow(entity, data)
            return
        }
        database.withTransaction {
            val uid = data.getValue("uid").jsonPrimitive.content
            val pending = outbox.forUid(entity, uid).map(::toOp)
            val merged = PendingOverlay.apply(data, pending) ?: return@withTransaction
            when (entity) {
                "task" -> database.taskDao().upsert(WireCodec.taskFromWire(merged))
                "project" -> database.projectDao().upsert(WireCodec.projectFromWire(merged))
                "area" -> database.areaDao().upsert(WireCodec.areaFromWire(merged))
                "tag" -> database.tagDao().upsert(WireCodec.tagFromWire(merged))
                "note" -> database.noteDao().upsert(WireCodec.noteFromWire(merged))
                "inbox_item" -> database.inboxDao().upsert(WireCodec.inboxFromWire(merged))
                else -> Unit
            }
        }
    }

    override suspend fun deleteRow(entity: String, uid: String) {
        if (entity in HABIT_ENTITIES) {
            habits?.deleteRow(entity, uid)
            return
        }
        when (entity) {
            "task" -> database.taskDao().delete(uid)
            "project" -> database.projectDao().delete(uid)
            "area" -> database.areaDao().delete(uid)
            "tag" -> database.tagDao().delete(uid)
            "note" -> database.noteDao().delete(uid)
            "inbox_item" -> database.inboxDao().delete(uid)
        }
    }

    override suspend fun pendingOps(limit: Int): List<OutboxOp> {
        val own = outbox.pending(limit).map(::toOp)
        return own + (habits?.pendingOps(limit - own.size) ?: emptyList())
    }

    override suspend fun removeOps(opIds: List<String>) {
        outbox.deleteByIds(opIds)
        habits?.removeOps(opIds)
    }

    override suspend fun recordFailure(opIds: List<String>, message: String) = outbox.markFailed(opIds, message)

    /** Appelé avant que la ligne rejetée ne soit retirée : son nom est encore disponible. */
    override suspend fun recordRejected(op: OutboxOp, reason: String?) {
        if (op.entity in HABIT_ENTITIES) {
            habits?.recordRejected(op, reason)
            return
        }
        database.failedOpDao().insert(
            FailedOpEntity(op.opId, op.entity, op.uid, reason, nowMs(), displayName(op.entity, op.uid)),
        )
    }

    private suspend fun displayName(entity: String, uid: String): String? = when (entity) {
        "task" -> database.taskDao().get(uid)?.name
        "project" -> database.projectDao().get(uid)?.name
        "area" -> database.areaDao().get(uid)?.name
        "tag" -> database.tagDao().get(uid)?.name
        "note" -> database.noteDao().get(uid)?.title
        "inbox_item" -> database.inboxDao().get(uid)?.content
        else -> null
    }

    override suspend fun saveClock(state: String) = clockState.save(state)

    override suspend fun markSynced(atMs: Long) {
        meta.put(SyncMetaEntity(LAST_SYNC, atMs.toString()))
    }

    private fun toOp(entity: OutboxEntity) = OutboxOp(
        opId = entity.opId,
        entity = entity.entity,
        uid = entity.uid,
        action = entity.action,
        payload = Json.parseToJsonElement(entity.payloadJson).jsonObject,
        attempts = entity.attempts,
    )

    companion object {
        const val CURSOR = "cursor"
        const val LAST_SYNC = "last_sync_at"
        const val HABITS_SNAPSHOT = "habits_snapshot"
    }
}
