package ch.nicolab.cadence.tasks.data

import androidx.room.withTransaction
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
) : SyncStore {
    private val meta = database.syncMetaDao()
    private val outbox = database.outboxDao()

    override suspend fun cursor(): Long? = meta.get(CURSOR)?.toLongOrNull()

    override suspend fun saveCursor(cursor: Long?) {
        if (cursor == null) meta.delete(CURSOR) else meta.put(SyncMetaEntity(CURSOR, cursor.toString()))
    }

    override suspend fun clearSyncedRows() = database.withTransaction {
        database.taskDao().deleteSynced()
        database.projectDao().deleteAll()
        database.areaDao().deleteAll()
        database.tagDao().deleteAll()
        database.inboxDao().deleteSynced()
    }

    override suspend fun applyServerRow(entity: String, data: JsonObject) {
        database.withTransaction {
            val uid = data.getValue("uid").jsonPrimitive.content
            val pending = outbox.forUid(entity, uid).map(::toOp)
            val merged = PendingOverlay.apply(data, pending) ?: return@withTransaction
            when (entity) {
                "task" -> database.taskDao().upsert(WireCodec.taskFromWire(merged))
                "project" -> database.projectDao().upsert(WireCodec.projectFromWire(merged))
                "area" -> database.areaDao().upsert(WireCodec.areaFromWire(merged))
                "tag" -> database.tagDao().upsert(WireCodec.tagFromWire(merged))
                "inbox_item" -> database.inboxDao().upsert(WireCodec.inboxFromWire(merged))
                else -> Unit
            }
        }
    }

    override suspend fun deleteRow(entity: String, uid: String) {
        when (entity) {
            "task" -> database.taskDao().delete(uid)
            "project" -> database.projectDao().delete(uid)
            "area" -> database.areaDao().delete(uid)
            "tag" -> database.tagDao().delete(uid)
            "inbox_item" -> database.inboxDao().delete(uid)
        }
    }

    override suspend fun pendingOps(limit: Int): List<OutboxOp> = outbox.pending(limit).map(::toOp)

    override suspend fun removeOps(opIds: List<String>) = outbox.deleteByIds(opIds)

    override suspend fun recordFailure(opIds: List<String>, message: String) = outbox.markFailed(opIds, message)

    override suspend fun recordRejected(op: OutboxOp, reason: String?) {
        database.failedOpDao().insert(FailedOpEntity(op.opId, op.entity, op.uid, reason, nowMs()))
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
    }
}
