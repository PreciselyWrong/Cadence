package ch.nicolab.cadence.tasks.sync

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

internal class FakeSyncApi : SyncApi {
    var onSnapshot: (String, Long, Long?) -> SnapshotPage = { _, _, _ -> SnapshotPage(0, null, emptyList()) }
    var onPull: suspend (Long) -> PullPage = { cursor -> PullPage(cursor, false, emptyList()) }
    var onPush: (List<JsonObject>) -> List<PushResult> = { emptyList() }

    val snapshotArgs = mutableListOf<Triple<String, Long, Long?>>()
    val snapshotEntities = mutableListOf<String>()
    val pullCursors = mutableListOf<Long>()

    /** Réponse de `/sync/meta` ; vide = serveur qui ne décrit pas ses entités. */
    var metaBody: JsonObject = JsonObject(emptyMap())

    override suspend fun meta(): JsonObject = metaBody

    override suspend fun profile(): AccountProfile = AccountProfile(email = null, timezone = null)

    override suspend fun snapshot(entity: String, after: Long, cursor: Long?, limit: Int): SnapshotPage {
        snapshotArgs += Triple(entity, after, cursor)
        if (after == 0L) snapshotEntities += entity
        return onSnapshot(entity, after, cursor)
    }

    override suspend fun pull(cursor: Long, limit: Int): PullPage {
        pullCursors += cursor
        return onPull(cursor)
    }

    override suspend fun push(ops: List<JsonObject>): List<PushResult> = onPush(ops)

    override suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String) = Unit

    var onSend: (String, String, JsonObject?) -> JsonObject = { _, _, _ -> JsonObject(emptyMap()) }
    val sent = mutableListOf<String>()

    override suspend fun send(method: String, path: String, body: JsonObject?): JsonObject {
        sent += "$method $path"
        return onSend(method, path, body)
    }
}

internal class FakeSyncStore(
    private var cursor: Long? = null,
    ops: List<OutboxOp> = emptyList(),
    rows: Map<Pair<String, String>, JsonObject> = emptyMap(),
    private val keepsRejected: Set<String> = emptySet(),
    calls: List<DeferredCall> = emptyList(),
    var snapshotted: Set<String>? = null,
) : SyncStore {
    val deferred = calls.toMutableList()
    val rejectedCalls = mutableListOf<String>()
    val conflicts = mutableListOf<ConflictRecord>()
    val failures = mutableMapOf<String, String>()

    override suspend fun snapshottedEntities(): Set<String>? = snapshotted

    override suspend fun saveSnapshottedEntities(entities: Set<String>) {
        snapshotted = entities
    }

    override suspend fun recordConflict(conflict: ConflictRecord) {
        conflicts += conflict
    }

    override suspend fun deferredCalls(): List<DeferredCall> = deferred.toList()

    override suspend fun removeDeferredCall(key: String) {
        deferred.removeAll { it.key == key }
    }

    override suspend fun failDeferredCall(call: DeferredCall, message: String) {
        failures[call.key] = message
    }

    override suspend fun rejectDeferredCall(call: DeferredCall, reason: String) {
        deferred.removeAll { it.key == call.key }
        rejectedCalls += call.key
    }

    override fun discardsRejectedCreation(entity: String) = entity !in keepsRejected

    private val queue = ops.toMutableList()
    private val table = rows.toMutableMap()
    val rejected = mutableListOf<String>()
    var clock: String? = null

    fun row(entity: String, uid: String): JsonObject = table[entity to uid] ?: JsonObject(emptyMap())

    override suspend fun cursor(): Long? = cursor

    override suspend fun saveCursor(cursor: Long?) {
        this.cursor = cursor
        if (cursor == null) snapshotted = null
    }

    override suspend fun clearSyncedRows() {
        table.clear()
    }

    override suspend fun applyServerRow(entity: String, data: JsonObject) {
        val uid = data.getValue("uid").jsonPrimitive.content
        val pending = queue.filter { it.entity == entity && it.uid == uid }
        PendingOverlay.apply(data, pending)?.let { table[entity to uid] = it }
    }

    override suspend fun deleteRow(entity: String, uid: String) {
        table.remove(entity to uid)
    }

    override suspend fun pendingOps(limit: Int): List<OutboxOp> = queue.take(limit)

    override suspend fun removeOps(opIds: List<String>) {
        queue.removeAll { it.opId in opIds }
    }

    override suspend fun recordFailure(opIds: List<String>, message: String) {
        opIds.forEach { failures[it] = message }
    }

    override suspend fun recordRejected(op: OutboxOp, reason: String?) {
        rejected += op.opId
    }

    override suspend fun saveClock(state: String) {
        clock = state
    }

    override suspend fun markSynced(atMs: Long) = Unit
}
