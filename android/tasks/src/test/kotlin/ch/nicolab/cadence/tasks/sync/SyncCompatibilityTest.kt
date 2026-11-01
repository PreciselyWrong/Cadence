package ch.nicolab.cadence.tasks.sync

import java.net.ConnectException
import java.net.SocketTimeoutException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray

import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Un téléphone à jour face à un serveur plus ancien (sans l'entité `link`, comme 2971ea4f) ou plus récent,
 * et face aux erreurs d'un serveur joignable : jamais « injoignable », jamais toute la file bloquée.
 */
class SyncCompatibilityTest {
    private fun engine(api: FakeSyncApi, store: FakeSyncStore) = SyncEngine(
        api = api,
        store = store,
        hlc = Hlc(node = "and12345678a", wallClock = { 1_700_000_000_000L }),
        nowMs = { 1L },
    )

    /** Ce que répond un serveur sans `link` : 400 `unknown_entity` sur son instantané. */
    private fun oldServer() = FakeSyncApi().apply {
        metaBody = oldServerMeta()
        onSnapshot = { entity, _, _ ->
            if (entity == "link") throw httpFailure(400, """{"error":"unknown_entity"}""")
            SnapshotPage(12, null, emptyList())
        }
        onPush = { ops -> ops.map { op -> pushAnswer(op) } }
    }

    /** Le serveur ancien répond `rejected: unknown_entity` à une opération `link`. */
    private fun pushAnswer(op: JsonObject): PushResult {
        val id = op.getValue("op_id").jsonPrimitive.content
        return if (op.getValue("entity").jsonPrimitive.content == "link") PushResult(id, "rejected", "unknown_entity")
        else PushResult(id, "applied", null)
    }

    @Test
    fun `un serveur sans l'entité link synchronise le reste au lieu d'être injoignable`() = runTest {
        val api = oldServer()
        val store = FakeSyncStore()
        val engine = engine(api, store)

        val result = engine.sync()

        assertEquals(SyncResult.Synced, result)
        assertEquals(null, engine.state.value.lastError)
        assertEquals(listOf("link"), engine.state.value.unsupported)
        assertEquals(12L, store.cursor())
        assertEquals(listOf("area", "goal", "project", "tag", "note", "task", "inbox_item"), api.snapshotEntities)
        assertFalse("link" in store.snapshotted!!)
    }

    @Test
    fun `une note de lien écrite face à un serveur ancien reste en file, le reste part`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-link", "link", "l1", "note" to "à lire"), op("op-task", "task", "t1")))
        store.snapshotted = setOf("area", "goal", "project", "tag", "note", "task", "inbox_item")
        val api = oldServer()
        val pushed = mutableListOf<String>()
        api.onPush = { ops -> ops.map { pushed += it.getValue("op_id").jsonPrimitive.content; pushAnswer(it) } }

        val result = engine(api, store).sync()

        assertEquals(SyncResult.Synced, result)
        assertEquals(listOf("op-task"), pushed)
        assertEquals(listOf("op-link"), store.pendingOps(10).map { it.opId })
        assertTrue(store.rejected.isEmpty())
    }

    @Test
    fun `le serveur mis à jour apprend link, l'entité est téléchargée seule et la file part`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-link", "link", "l1", "note" to "à lire")))
        store.snapshotted = setOf("area", "goal", "project", "tag", "note", "task", "inbox_item")
        val pushed = mutableListOf<String>()
        val api = FakeSyncApi().apply {
            metaBody = newServerMeta()
            onSnapshot = { entity, _, _ ->
                SnapshotPage(40, null, if (entity == "link") listOf(buildJsonObject { put("uid", "l1"); put("url", "https://a.io") }) else emptyList())
            }
            onPush = { ops -> ops.map { pushed += it.getValue("op_id").jsonPrimitive.content; PushResult(it.getValue("op_id").jsonPrimitive.content, "applied", null) } }
        }

        val result = engine(api, store).sync()

        assertEquals(SyncResult.Synced, result)
        assertEquals(listOf("link"), api.snapshotEntities)
        assertEquals(5L, store.cursor())
        assertTrue("link" in store.snapshotted!!)
        assertEquals(listOf("op-link"), pushed)
        assertEquals("https://a.io", store.row("link", "l1")["url"]!!.jsonPrimitive.content)
    }

    @Test
    fun `une installation antérieure sans liste d'entités reçues ne retélécharge rien`() = runTest {
        val api = FakeSyncApi().apply { metaBody = newServerMeta() }
        val store = FakeSyncStore(cursor = 5)

        engine(api, store).sync()

        assertTrue(api.snapshotEntities.isEmpty())
        assertTrue("link" in store.snapshotted!!)
    }

    @Test
    fun `un serveur plus récent, entité et champs inconnus du téléphone sont ignorés au tirage`() = runTest {
        val store = FakeSyncStore(cursor = 5)
        val api = FakeSyncApi().apply {
            metaBody = meta(4, "task" to listOf("name"), "widget_board" to listOf("title"))
            onPull = {
                PullPage(
                    7,
                    false,
                    listOf(
                        RemoteChange(6, "widget_board", "w1", "upsert", buildJsonObject { put("uid", "w1") }, null),
                        RemoteChange(7, "task", "t1", "upsert", buildJsonObject { put("uid", "t1"); put("name", "a"); put("mood", "neuf") }, null),
                    ),
                )
            }
        }

        val result = engine(api, store).sync()

        assertEquals(SyncResult.Synced, result)
        assertTrue(store.row("widget_board", "w1").isEmpty())
        assertEquals("a", store.row("task", "t1")["name"]!!.jsonPrimitive.content)
    }

    @Test
    fun `un champ que le serveur ne connaît pas garde l'opération, et les suivantes de la même ligne`() = runTest {
        val store = FakeSyncStore(
            cursor = 5,
            ops = listOf(
                op("op-1", "task", "t1", "name" to "a", "mood" to "neuf"),
                op("op-2", "task", "t1", "name" to "b"),
                op("op-3", "task", "t2", "name" to "c"),
            ),
        )
        val pushed = mutableListOf<String>()
        val api = FakeSyncApi().apply {
            metaBody = meta(3, "task" to listOf("name"))
            onPush = { ops -> ops.map { pushed += it.getValue("op_id").jsonPrimitive.content; PushResult(it.getValue("op_id").jsonPrimitive.content, "applied", null) } }
        }

        engine(api, store).sync()

        assertEquals(listOf("op-3"), pushed)
        assertEquals(listOf("op-1", "op-2"), store.pendingOps(10).map { it.opId })
    }

    @Test
    fun `une erreur HTTP 500 dit erreur du serveur, jamais injoignable, et garde la file`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task", "t1")))
        val api = FakeSyncApi().apply { onPull = { throw httpFailure(500, """{"error":"Internal Server Error"}""") } }
        val engine = engine(api, store)

        val result = engine.sync()

        assertEquals(SyncResult.Failed("Erreur du serveur (HTTP 500 : Internal Server Error)"), result)
        assertEquals("Erreur du serveur (HTTP 500 : Internal Server Error)", engine.state.value.lastError)
    }

    @Test
    fun `une page HTML de proxy dit réponse inattendue`() = runTest {
        val api = FakeSyncApi().apply { onPull = { parseResponse("<html>Portail</html>"); error("non atteint") } }
        val engine = engine(api, FakeSyncStore(cursor = 5))

        val result = engine.sync()

        assertTrue(result is SyncResult.Failed)
        assertTrue(engine.state.value.lastError!!.startsWith("Réponse inattendue du serveur"))
    }

    @Test
    fun `seule une connexion refusée dit serveur injoignable, un délai dépassé le dit`() = runTest {
        val refused = engine(FakeSyncApi().apply { onPull = { throw ConnectException("ECONNREFUSED") } }, FakeSyncStore(cursor = 5))
        assertEquals(SyncResult.Offline("Serveur injoignable"), refused.sync())

        val slow = engine(FakeSyncApi().apply { onPull = { throw SocketTimeoutException("timeout") } }, FakeSyncStore(cursor = 5))
        assertEquals(SyncResult.Offline("Le serveur ne répond pas (délai dépassé)"), slow.sync())
    }

    @Test
    fun `une erreur imprévue de lecture d'une ligne finit en message, pas en plantage`() = runTest {
        val store = FakeSyncStore(cursor = 5)
        val api = FakeSyncApi().apply {
            onPull = { PullPage(6, false, listOf(RemoteChange(6, "task", "t1", "upsert", buildJsonObject { put("name", "sans uid") }, null))) }
        }

        val result = engine(api, store).sync()

        assertTrue(result is SyncResult.Failed, result.toString())
    }

    @Test
    fun `un lot refusé en bloc est renvoyé par moitiés, seule l'opération illisible est rejetée`() = runTest {
        val ops = (1..6).map { op("op-$it", "task", "t$it") }
        val store = FakeSyncStore(cursor = 5, ops = ops)
        var requests = 0
        val api = FakeSyncApi().apply {
            onPush = { batch ->
                requests += 1
                val ids = batch.map { it.getValue("op_id").jsonPrimitive.content }
                if ("op-4" in ids) throw httpFailure(400, """{"error":"invalid_payload"}""")
                ids.map { PushResult(it, "applied", null) }
            }
        }
        val engine = engine(api, store)

        val result = engine.sync()

        assertEquals(SyncResult.Synced, result)
        assertTrue(store.pendingOps(10).isEmpty())
        assertEquals(listOf("op-4"), store.rejected)
        assertEquals("1 modification refusée par le serveur", engine.state.value.lastError)
        assertTrue(requests <= 7, "requêtes : $requests")
    }

    @Test
    fun `une opération qui fait planter le serveur reste en file sans retenir les autres`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task", "t1"), op("op-2", "task", "t2"), op("op-3", "task", "t2", "name" to "suite")))
        val api = FakeSyncApi().apply {
            onPush = { batch ->
                val ids = batch.map { it.getValue("op_id").jsonPrimitive.content }
                if ("op-2" in ids) throw httpFailure(500, null)
                ids.map { PushResult(it, "applied", null) }
            }
        }
        val engine = engine(api, store)

        val result = engine.sync()

        assertEquals(SyncResult.Synced, result)
        // op-3 touche la même tâche qu'op-2 : elle attend avec elle, pour garder l'ordre.
        assertEquals(listOf("op-2", "op-3"), store.pendingOps(10).map { it.opId })
        assertTrue(store.rejected.isEmpty())
        assertEquals("Erreur du serveur (HTTP 500)", store.failures["op-2"])
        assertTrue(engine.state.value.lastError!!.contains("en attente"))
    }

    @Test
    fun `un serveur indisponible (503) arrête l'envoi sans rien isoler`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task", "t1"), op("op-2", "task", "t2")))
        var requests = 0
        val api = FakeSyncApi().apply { onPush = { requests += 1; throw httpFailure(503, null) } }

        val result = engine(api, store).sync()

        assertEquals(SyncResult.Failed("Serveur indisponible pour le moment (HTTP 503)"), result)
        assertEquals(1, requests)
        assertEquals(2, store.pendingOps(10).size)
    }

    @Test
    fun `un conflit perdu garde la valeur du téléphone et celle du serveur`() = runTest {
        val store = FakeSyncStore(cursor = 5, ops = listOf(op("op-1", "task", "t1", "name" to "écrit hors ligne")))
        val api = FakeSyncApi().apply {
            onPush = { listOf(PushResult("op-1", "conflict", null, rejectedFields = listOf("name"))) }
            onSnapshot = { entity, _, _ ->
                SnapshotPage(5, null, if (entity == "task") listOf(buildJsonObject { put("uid", "t1"); put("name", "écrit sur le web") }) else emptyList())
            }
        }

        engine(api, store).sync()

        val conflict = store.conflicts.single()
        assertEquals("name", conflict.field)
        assertEquals("écrit hors ligne", conflict.local.jsonPrimitive.content)
        assertEquals("écrit sur le web", conflict.server!!.jsonPrimitive.content)
        assertEquals("écrit sur le web", store.row("task", "t1")["name"]!!.jsonPrimitive.content)
    }

    @Test
    fun `les réponses de push se lisent avec leurs champs en conflit`() {
        val results = pushResultsOf(parseResponse("""{"results":[{"op_id":"a","status":"conflict","rejected_fields":["name","note"]},{"op_id":"b","status":"applied"}]}"""))
        assertEquals(listOf("name", "note"), results[0].rejectedFields)
        assertEquals(emptyList<String>(), results[1].rejectedFields)
    }

    @Test
    fun `les appels faits hors ligne repartent, un refus 4xx est noté, une panne 500 attend`() = runTest {
        val store = FakeSyncStore(
            cursor = 5,
            calls = listOf(
                DeferredCall("week-capacity", "PUT", "/api/v1/review/week/capacity", null, "Temps"),
                DeferredCall("project-reviewed:p1", "POST", "/api/v1/project/p1/reviewed", null, "Garder"),
                DeferredCall("weekly-routine", "POST", "/api/v1/review/weekly-routine", null, "Routine"),
            ),
        )
        val api = FakeSyncApi().apply {
            onSend = { _, path, _ ->
                when {
                    path.contains("project") -> throw httpFailure(404, """{"error":"Project not found"}""")
                    path.contains("routine") -> throw httpFailure(500, null)
                    else -> JsonObject(emptyMap())
                }
            }
        }
        val engine = engine(api, store)

        val result = engine.sync()

        assertEquals(SyncResult.Synced, result)
        assertEquals(3, api.sent.size)
        assertEquals(listOf("weekly-routine"), store.deferred.map { it.key })
        assertEquals(listOf("project-reviewed:p1"), store.rejectedCalls)
        assertEquals("1 modification refusée par le serveur", engine.state.value.lastError)
    }

    @Test
    fun `un appel différé hors ligne reste en file`() = runTest {
        val store = FakeSyncStore(cursor = 5, calls = listOf(DeferredCall("week-capacity", "PUT", "/x", null, "Temps")))
        val api = FakeSyncApi().apply { onSend = { _, _, _ -> throw ConnectException("refused") } }

        assertTrue(engine(api, store).sync() is SyncResult.Offline)
        assertEquals(1, store.deferred.size)
    }

    @Test
    fun `le catalogue lit fields, refs et lists de meta`() {
        val catalog = ServerCatalog.of(
            parseResponse(
                """{"schema_version":3,"entities":[{"name":"task","fields":["name"],"refs":{"project_uid":"project"},"lists":{"tag_uids":"tag"}}]}""",
            ),
        )
        assertEquals(3, catalog.schemaVersion)
        assertTrue(catalog.knows("task"))
        assertFalse(catalog.knows("link"))
        assertTrue(catalog.accepts(op("a", "task", "t", "name" to "x", "project_uid" to "p", "tag_uids" to "t")))
        assertFalse(catalog.accepts(op("b", "task", "t", "mood" to "x")))
        assertTrue(ServerCatalog.of(JsonObject(emptyMap())).knows("link"))
    }

    private fun oldServerMeta(): JsonObject = meta(
        3,
        "task" to listOf("name", "note", "status", "priority", "due_date", "project_uid", "tag_uids"),
        "project" to listOf("name", "status"),
        "goal" to listOf("title"),
        "area" to listOf("name"),
        "tag" to listOf("name"),
        "note" to listOf("title", "content"),
        "inbox_item" to listOf("content", "title", "status", "source"),
    )

    private fun newServerMeta(): JsonObject {
        val old = oldServerMeta()
        val link = buildJsonObject {
            put("name", "link")
            put("fields", buildJsonArray { add(JsonPrimitive("note")); add(JsonPrimitive("status")) })
        }
        return JsonObject(old + ("entities" to kotlinx.serialization.json.JsonArray(old.getValue("entities").jsonArray + link)))
    }

    private fun meta(schema: Int, vararg entities: Pair<String, List<String>>): JsonObject = buildJsonObject {
        put("schema_version", schema)
        put("entities", buildJsonArray {
            entities.forEach { (name, fields) ->
                add(buildJsonObject {
                    put("name", name)
                    put("fields", buildJsonArray { fields.forEach { add(JsonPrimitive(it)) } })
                })
            }
        })
    }

    private fun op(opId: String, entity: String, uid: String, vararg fields: Pair<String, String>) = OutboxOp(
        opId = opId,
        entity = entity,
        uid = uid,
        action = "upsert",
        payload = buildJsonObject {
            put("op_id", opId)
            put("entity", entity)
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
