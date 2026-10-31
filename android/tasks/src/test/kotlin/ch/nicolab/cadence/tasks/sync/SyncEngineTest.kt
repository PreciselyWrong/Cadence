package ch.nicolab.cadence.tasks.sync

import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SyncEngineTest {
    private val fieldClock = "1700000000000-0000-server"

    private fun engine(api: FakeSyncApi, store: FakeSyncStore) = SyncEngine(
        api = api,
        store = store,
        hlc = Hlc(node = "and12345678a", wallClock = { 1_700_000_000_000L }),
        nowMs = { 1L },
    )

    @Test
    fun `premier passage télécharge l'instantané puis enregistre le curseur`() = runTest {
        val api = FakeSyncApi().apply {
            onSnapshot = { entity, _, _ ->
                SnapshotPage(
                    cursor = if (entity == "area") 42 else 99,
                    next = null,
                    rows = if (entity == "task") listOf(row("task-1", "Acheter du pain")) else emptyList(),
                )
            }
        }
        val store = FakeSyncStore()

        val result = engine(api, store).sync()

        assertEquals(SyncResult.Synced, result)
        assertEquals(42L, store.cursor())
        assertEquals("Acheter du pain", store.row("task", "task-1")["name"]!!.jsonPrimitive.content)
        assertEquals(listOf("area", "project", "tag", "note", "task", "inbox_item"), api.snapshotEntities)
    }

    @Test
    fun `les pages suivantes reprennent après le dernier id avec le curseur de la première page`() = runTest {
        val api = FakeSyncApi().apply {
            onSnapshot = { entity, after, _ ->
                when {
                    entity != "task" -> SnapshotPage(10, null, emptyList())
                    after == 0L -> SnapshotPage(10, 500, listOf(row("task-1", "a")))
                    else -> SnapshotPage(77, null, listOf(row("task-2", "b")))
                }
            }
        }
        val store = FakeSyncStore()

        engine(api, store).sync()

        assertEquals(listOf(0L to null, 500L to 10L), api.snapshotArgs.filter { it.first == "task" }.map { it.second to it.third })
        assertTrue(store.row("task", "task-2").isNotEmpty())
    }

    @Test
    fun `une opération acceptée sort de la file, une rejetée est notée`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task-1"), op("op-2", "task-2")))
        val api = FakeSyncApi().apply {
            onPush = { listOf(PushResult("op-1", "applied", null), PushResult("op-2", "rejected", "invalid_reference:project_uid")) }
            onPull = { PullPage(5, false, emptyList()) }
        }

        engine(api, store).sync()

        assertTrue(store.pendingOps(10).isEmpty())
        assertEquals(listOf("op-2"), store.rejected)
    }

    @Test
    fun `un conflit sort de la file et relit l'entité pour afficher la valeur gagnante`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task-1")))
        val api = FakeSyncApi().apply {
            onPush = { listOf(PushResult("op-1", "conflict", null)) }
            onSnapshot = { entity, _, _ ->
                SnapshotPage(5, null, if (entity == "task") listOf(row("task-1", "valeur serveur")) else emptyList())
            }
            onPull = { PullPage(5, false, emptyList()) }
        }

        engine(api, store).sync()

        assertTrue(store.pendingOps(10).isEmpty())
        assertEquals("valeur serveur", store.row("task", "task-1")["name"]!!.jsonPrimitive.content)
    }

    @Test
    fun `une panne réseau garde les opérations et renvoie hors ligne`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task-1")))
        val api = FakeSyncApi().apply {
            onPush = { throw IOException("pas de réseau") }
        }

        val result = engine(api, store).sync()

        assertEquals(SyncResult.Offline("pas de réseau"), result)
        assertEquals(listOf("op-1"), store.pendingOps(10).map { it.opId })
        assertEquals(5L, store.cursor())
    }

    @Test
    fun `une clé refusée n'est pas réessayée et le dit`() = runTest {
        val store = FakeSyncStore(cursor = 5)
        val api = FakeSyncApi().apply { onPull = { throw AuthError("401") } }

        assertEquals(SyncResult.Unauthorized, engine(api, store).sync())
    }

    @Test
    fun `un pull réapplique les champs locaux encore en attente`() = runTest {
        val store = FakeSyncStore(cursor = 7, ops = listOf(op("op-1", "task-1", "name" to "modifié ici")))
        val api = FakeSyncApi().apply {
            // Le serveur n'a pas encore répondu à l'opération : elle reste en file.
            onPush = { emptyList() }
            onPull = {
                PullPage(
                    9,
                    false,
                    listOf(RemoteChange(8, "task", "task-1", "upsert", row("task-1", "serveur", status = 1), "autre")),
                )
            }
        }

        engine(api, store).sync()

        val stored = store.row("task", "task-1")
        assertEquals("modifié ici", stored["name"]!!.jsonPrimitive.content)
        assertEquals("1", stored["status"]!!.jsonPrimitive.content)
    }

    @Test
    fun `un delete distant retire la ligne`() = runTest {
        val store = FakeSyncStore(cursor = 7, rows = mapOf(("task" to "task-1") to row("task-1", "à supprimer")))
        val api = FakeSyncApi().apply {
            onPull = { PullPage(8, false, listOf(RemoteChange(8, "task", "task-1", "delete", null, "autre"))) }
        }

        engine(api, store).sync()

        assertTrue(store.row("task", "task-1").isEmpty())
    }

    @Test
    fun `le curseur est enregistré après chaque page de changements`() = runTest {
        val store = FakeSyncStore(cursor = 7)
        val api = FakeSyncApi().apply {
            onPull = { cursor ->
                if (cursor == 7L) PullPage(8, true, listOf(RemoteChange(8, "area", "area-1", "delete", null, null)))
                else PullPage(9, false, listOf(RemoteChange(9, "area", "area-2", "delete", null, null)))
            }
        }

        engine(api, store).sync()

        assertEquals(listOf(7L, 8L), api.pullCursors)
        assertEquals(9L, store.cursor())
    }

    @Test
    fun `une horloge reçue est observée avant les écritures suivantes`() = runTest {
        val store = FakeSyncStore(cursor = 7)
        val api = FakeSyncApi().apply {
            onPull = {
                PullPage(8, false, listOf(RemoteChange(8, "task", "task-1", "upsert", row("task-1", "x", clock = "1700000000005-0003-web"), "autre")))
            }
        }

        engine(api, store).sync()

        assertTrue(store.clock!!.startsWith("1700000000005-0003-"), store.clock)
    }

    @Test
    fun `un refus sur une habitude garde la ligne locale, la montre et ne reboucle pas`() = runTest {
        val habitOp = op("op-1", "habit-0001").let {
            OutboxOp(it.opId, "habit_goal", "habit-0001", "upsert", it.payload)
        }
        val store = FakeSyncStore(
            cursor = 5,
            ops = listOf(habitOp),
            rows = mapOf(("habit_goal" to "habit-0001") to row("habit-0001", "local")),
            keepsRejected = setOf("habit_goal"),
        )
        var pushes = 0
        val api = FakeSyncApi().apply {
            onPush = { pushes += 1; listOf(PushResult("op-1", "rejected", "invalid_value:target_minor")) }
            onSnapshot = { _, _, _ -> SnapshotPage(5, null, emptyList()) }
            onPull = { PullPage(5, false, emptyList()) }
        }
        val engine = SyncEngine(
            api, store, Hlc(node = "and12345678a", wallClock = { 1_700_000_000_000L }),
            nowMs = { 1L }, entities = listOf("habit_group", "habit", "habit_goal"),
        )

        engine.sync()
        engine.sync()

        assertEquals("local", store.row("habit_goal", "habit-0001")["name"]!!.jsonPrimitive.content)
        assertEquals(listOf("op-1"), store.rejected)
        assertEquals(1, pushes)
    }

    @Test
    fun `une création rejetée et absente du serveur disparaît et laisse un échec nommé`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task-1")), rows = mapOf(("task" to "task-1") to row("task-1", "Acheter du lait")))
        val api = FakeSyncApi().apply {
            onPush = { listOf(PushResult("op-1", "rejected", "invalid_reference:project_uid")) }
            onSnapshot = { _, _, _ -> SnapshotPage(5, null, emptyList()) }
            onPull = { PullPage(5, false, emptyList()) }
        }
        val engine = engine(api, store)

        engine.sync()

        assertTrue(store.row("task", "task-1").isEmpty())
        assertEquals(listOf("op-1"), store.rejected)
        assertEquals("1 modification refusée par le serveur", engine.state.value.lastError)
    }

    @Test
    fun `une modification rejetée dont la tâche existe encore garde la valeur du serveur`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task-1")))
        val api = FakeSyncApi().apply {
            onPush = { listOf(PushResult("op-1", "rejected", "invalid_reference:project_uid")) }
            onSnapshot = { entity, _, _ -> SnapshotPage(5, null, if (entity == "task") listOf(row("task-1", "valeur serveur")) else emptyList()) }
            onPull = { PullPage(5, false, emptyList()) }
        }

        engine(api, store).sync()

        assertEquals("valeur serveur", store.row("task", "task-1")["name"]!!.jsonPrimitive.content)
    }

    @Test
    fun `une fermeture pendant l'instantané n'écrit plus aucune ligne`() = runTest {
        val store = FakeSyncStore()
        lateinit var engine: SyncEngine
        val api = FakeSyncApi().apply {
            onSnapshot = { entity, _, _ ->
                if (entity == "area") engine.markClosed()
                SnapshotPage(5, null, if (entity == "task") listOf(row("task-1", "écrit trop tard")) else emptyList())
            }
        }
        engine = engine(api, store)

        val result = engine.sync()

        assertEquals(SyncResult.Closed, result)
        assertTrue(store.row("task", "task-1").isEmpty())
        assertEquals(null, store.cursor())
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `whileIdle attend le passage en cours avant de s'exécuter`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeSyncApi().apply {
            onPull = {
                gate.await()
                PullPage(6, false, emptyList())
            }
        }
        val engine = engine(api, FakeSyncStore(cursor = 5))
        val order = mutableListOf<String>()

        val sync = async { engine.sync().also { order += "passage" } }
        runCurrent()
        val clear = async { engine.whileIdle { order += "effacement" } }
        runCurrent()
        assertEquals(emptyList<String>(), order)

        gate.complete(Unit)
        sync.await()
        clear.await()
        assertEquals(listOf("passage", "effacement"), order)
    }

    private fun row(uid: String, name: String, status: Int = 0, clock: String = fieldClock): JsonObject = buildJsonObject {
        put("uid", uid)
        put("name", name)
        put("status", status)
        put("field_clocks", buildJsonObject { put("name", clock) })
    }

    private fun op(opId: String, uid: String, vararg fields: Pair<String, String>) = OutboxOp(
        opId = opId,
        entity = "task",
        uid = uid,
        action = "upsert",
        payload = buildJsonObject {
            put("op_id", opId)
            put("entity", "task")
            put("uid", uid)
            put("action", "upsert")
            put("fields", buildJsonObject {
                val values = if (fields.isEmpty()) listOf("name" to "local") else fields.toList()
                values.forEach { (name, value) ->
                    put(name, buildJsonObject {
                        put("value", value)
                        put("hlc", "1700000000001-0000-and000000001")
                    })
                }
            })
        },
    )
}

private class FakeSyncApi : SyncApi {
    var onSnapshot: (String, Long, Long?) -> SnapshotPage = { _, _, _ -> SnapshotPage(0, null, emptyList()) }
    var onPull: suspend (Long) -> PullPage = { cursor -> PullPage(cursor, false, emptyList()) }
    var onPush: (List<JsonObject>) -> List<PushResult> = { emptyList() }

    val snapshotArgs = mutableListOf<Triple<String, Long, Long?>>()
    val snapshotEntities = mutableListOf<String>()
    val pullCursors = mutableListOf<Long>()

    override suspend fun meta(): JsonObject = JsonObject(emptyMap())

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
}

private class FakeSyncStore(
    private var cursor: Long? = null,
    ops: List<OutboxOp> = emptyList(),
    rows: Map<Pair<String, String>, JsonObject> = emptyMap(),
    private val keepsRejected: Set<String> = emptySet(),
) : SyncStore {
    override fun discardsRejectedCreation(entity: String) = entity !in keepsRejected

    private val queue = ops.toMutableList()
    private val table = rows.toMutableMap()
    val rejected = mutableListOf<String>()
    var clock: String? = null

    fun row(entity: String, uid: String): JsonObject = table[entity to uid] ?: JsonObject(emptyMap())

    override suspend fun cursor(): Long? = cursor

    override suspend fun saveCursor(cursor: Long?) {
        this.cursor = cursor
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

    override suspend fun recordFailure(opIds: List<String>, message: String) = Unit

    override suspend fun recordRejected(op: OutboxOp, reason: String?) {
        rejected += op.opId
    }

    override suspend fun saveClock(state: String) {
        clock = state
    }

    override suspend fun markSynced(atMs: Long) = Unit
}
