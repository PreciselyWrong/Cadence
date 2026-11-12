package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.model.LinkDraft
import ch.nicolab.cadence.tasks.model.LinkStatus
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncApi
import ch.nicolab.cadence.tasks.sync.SyncState
import java.lang.reflect.Proxy
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Liens et décisions de l'Inbox : ligne Room, file d'envoi et appels différés, sur une base en mémoire. */
@RunWith(AndroidJUnit4::class)
class LinkRepositoryTest {
    private lateinit var database: TududiDatabase
    private lateinit var repository: RoomTaskRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        runCatching { WorkManager.initialize(context, Configuration.Builder().build()) }
        database = Room.inMemoryDatabaseBuilder(context, TududiDatabase::class.java).allowMainThreadQueries().build()
        repository = RoomTaskRepository(
            context = context,
            database = database,
            api = offline<SyncApi>(),
            hlc = Hlc("test"),
            clockState = ClockStateStore(context),
            connection = offline<ServerConnection>(),
            syncState = MutableStateFlow(SyncState()),
            deviceZone = MutableStateFlow(ZoneId.of("UTC")),
            nowMs = { 1_000L },
        )
    }

    @After
    fun tearDown() = database.close()

    /** Aucun appel réseau ne doit avoir lieu : une interface qui échoue à tout appel, quelle que soit sa forme. */
    private inline fun <reified T : Any> offline(): T = Proxy.newProxyInstance(T::class.java.classLoader, arrayOf(T::class.java)) { _, method, _ ->
        error("hors ligne : ${method.name}")
    } as T

    private fun link(uid: String) = LinkEntity(
        uid, "https://a.io/x", "A", null, null, null, "tool", null, null, null, null, null, "new", "[]", "inbox_item", "e1", "done", null,
    )

    private fun pending() = runBlocking { database.outboxDao().pending(100) }.map { op ->
        val payload = Json.parseToJsonElement(op.payloadJson).jsonObject
        Triple(op.entity, op.uid, payload.getValue("fields").jsonObject.mapValues { (_, f) -> f.jsonObject.getValue("value") })
    }

    @Test
    fun `setting link tags writes the row and one tag_uids upsert, without duplicates`() = runBlocking {
        database.linkDao().upsert(link("l1"))

        repository.setLinkTags("l1", listOf("t1", "t2", "t1"))

        assertEquals("""["t1","t2"]""", database.linkDao().get("l1")?.tagUidsJson)
        val op = pending().single()
        assertEquals("link", op.first)
        assertEquals("l1", op.second)
        assertEquals(setOf("tag_uids"), op.third.keys)
        assertEquals(listOf("t1", "t2"), op.third.getValue("tag_uids").jsonArray.map { it.jsonPrimitive.content })
    }

    @Test
    fun `a new title and project are written and queued, an empty title goes back to the page`() = runBlocking {
        database.linkDao().upsert(link("l1"))

        repository.setLinkTitle("l1", "  Mon nom ")
        repository.setLinkProject("l1", "p1")

        assertEquals("Mon nom", database.linkDao().get("l1")?.title)
        assertEquals("p1", database.linkDao().get("l1")?.projectUid)
        assertEquals(listOf(setOf("title"), setOf("project_uid")), pending().map { it.third.keys })

        repository.setLinkTitle("l1", "  ")
        assertEquals(null, database.linkDao().get("l1")?.title)
    }

    @Test
    fun `a new address goes through a deferred call, the same one changes nothing`() = runBlocking {
        database.linkDao().upsert(link("l1"))

        repository.setLinkUrl("l1", "https://a.io/x", "Adresse")
        assertTrue(database.deferredCallDao().all().isEmpty())

        repository.setLinkUrl("l1", " https://b.io/y ", "Adresse")
        assertEquals("https://b.io/y", database.linkDao().get("l1")?.url)
        val call = database.deferredCallDao().all().single()
        assertEquals("PATCH", call.method)
        assertEquals("/api/v1/links/l1", call.path)
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `adding an address of a task queues one call with the task as source`() = runBlocking {
        repository.addLinkFrom(" https://github.com/a/tool ", "task", "t1", "Ajouter aux liens")
        repository.addLinkFrom("https://github.com/a/tool", "task", "t1", "Ajouter aux liens")

        val call = database.deferredCallDao().all().single()
        assertEquals("POST", call.method)
        assertEquals("/api/v1/links", call.path)
        val body = Json.parseToJsonElement(call.bodyJson!!).jsonObject
        assertEquals("https://github.com/a/tool", body["url"]?.jsonPrimitive?.content)
        assertEquals("task", body["source_type"]?.jsonPrimitive?.content)
        assertEquals("t1", body["source_uid"]?.jsonPrimitive?.content)
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `deleting removes the row, queues the delete and drops a waiting address`() = runBlocking {
        database.linkDao().upsert(link("l1"))
        repository.setLinkUrl("l1", "https://b.io/y", "Adresse")

        repository.deleteLink("l1")

        assertEquals(null, database.linkDao().get("l1"))
        assertTrue(database.deferredCallDao().all().isEmpty())
        val op = database.outboxDao().pending(100).single()
        assertEquals("link", op.entity)
        assertEquals("l1", op.uid)
    }

    @Test
    fun `tags of an unknown link write nothing`() = runBlocking {
        repository.setLinkTags("ghost", listOf("t1"))

        assertTrue(pending().isEmpty())
    }

    @Test
    fun `processing an idea hides it from the inbox and sends a status-only upsert`() = runBlocking {
        val uid = repository.captureInbox("https://a.io/x")
        database.outboxDao().deleteByIds(database.outboxDao().pending(100).map { it.opId })

        repository.processInboxItem(uid)

        assertEquals("processed", database.inboxDao().get(uid)?.status)
        assertTrue(repository.observeInbox().first().isEmpty())
        val op = pending().single()
        assertEquals("inbox_item", op.first)
        assertEquals(uid, op.second)
        assertEquals(mapOf("status" to JsonPrimitive("processed")), op.third)
    }

    @Test
    fun `a link keeps its status when its idea is processed`() = runBlocking {
        database.linkDao().upsert(link("l1"))
        val uid = repository.captureInbox("https://a.io/x")

        repository.setLinkStatus("l1", LinkStatus.DROPPED)
        repository.processInboxItem(uid)

        assertEquals("dropped", database.linkDao().get("l1")?.status)
        assertEquals(listOf("inbox_item", "link", "inbox_item"), pending().map { it.first })
    }

    @Test
    fun `a review day is kept on the link and sent to the server`() = runBlocking {
        database.linkDao().upsert(link("l1"))

        repository.setLinkReviewDate("l1", LocalDate.of(2027, 1, 2))

        assertEquals("2027-01-02", database.linkDao().get("l1")?.reviewAtRaw)
        assertEquals(
            listOf(Triple("link", "l1", mapOf("review_at" to JsonPrimitive("2027-01-02")))),
            pending(),
        )
    }

    @Test
    fun `clearing the review day sends null`() = runBlocking {
        database.linkDao().upsert(link("l1").copy(reviewAtRaw = "2027-01-02"))

        repository.setLinkReviewDate("l1", null)

        assertNull(database.linkDao().get("l1")?.reviewAtRaw)
        assertEquals(listOf(Triple("link", "l1", mapOf("review_at" to JsonNull))), pending())
    }

    @Test
    fun `processing an unknown idea writes nothing`() = runBlocking {
        repository.processInboxItem("ghost")
        repository.reopenInboxItem("ghost")

        assertTrue(pending().isEmpty())
    }

    private fun body(call: DeferredCallEntity) = Json.parseToJsonElement(call.bodyJson!!).jsonObject

    @Test
    fun `saving an idea to the links queues one POST with title, note, tag names, project and the idea as source`() = runBlocking {
        val draft = LinkDraft(" https://a.io/x ", "A", "pour les factures", listOf("dev", "perso/sport"), "p1", "inbox_item", "e1")

        repository.addLink(draft, "Ajouter aux liens")
        repository.addLink(draft, "Ajouter aux liens")

        val call = database.deferredCallDao().all().single()
        assertEquals("POST", call.method)
        assertEquals("/api/v1/links", call.path)
        assertEquals("link-add:inbox_item:e1:https://a.io/x", call.key)
        val sent = body(call)
        assertEquals("https://a.io/x", sent["url"]?.jsonPrimitive?.content)
        assertEquals("A", sent["title"]?.jsonPrimitive?.content)
        assertEquals("pour les factures", sent["note"]?.jsonPrimitive?.content)
        assertEquals(listOf("dev", "perso/sport"), sent["tags"]?.jsonArray?.map { it.jsonPrimitive.content })
        assertEquals("p1", sent["project_uid"]?.jsonPrimitive?.content)
        assertEquals("inbox_item", sent["source_type"]?.jsonPrimitive?.content)
        assertEquals("e1", sent["source_uid"]?.jsonPrimitive?.content)
        assertTrue("aucune ligne link avant la synchro", database.linkDao().get("e1") == null && pending().isEmpty())
    }

    @Test
    fun `a bare shared link sends only its address`() = runBlocking {
        repository.addLink(LinkDraft("https://a.io/x"), "Ajouter aux liens")

        assertEquals(setOf("url"), body(database.deferredCallDao().all().single()).keys)
    }

    @Test
    fun `adding a project page writes the row and one upsert with url, project, title and note`() = runBlocking {
        val uid = repository.addProjectPage("p1", " https://a.io/x ", "Guide", "à relire")

        val row = database.linkDao().get(uid)!!
        assertEquals("p1", row.projectUid)
        assertEquals("https://a.io/x", row.url)
        assertEquals("pending", row.fetchStatus)
        val (entity, opUid, fields) = pending().single()
        assertEquals("link" to uid, entity to opUid)
        assertEquals(setOf("url", "project_uid", "title", "note"), fields.keys)
        assertEquals("https://a.io/x", fields.getValue("url").jsonPrimitive.content)
        assertEquals("p1", fields.getValue("project_uid").jsonPrimitive.content)
        assertTrue(database.deferredCallDao().all().isEmpty())
    }

    @Test
    fun `a page already in the project is not added twice, whatever its www or trailing slash`() = runBlocking {
        val first = repository.addProjectPage("p1", "https://example.com/a", null, null)
        val again = repository.addProjectPage("p1", "https://www.example.com/a/", null, null)

        assertEquals(first, again)
        assertEquals(1, database.linkDao().inProject("p1").size)
        assertEquals(1, pending().size)
    }

    @Test
    fun `the same address in another project is another page`() = runBlocking {
        val first = repository.addProjectPage("p1", "https://example.com/a", null, null)
        val other = repository.addProjectPage("p2", "https://example.com/a", null, null)

        assertTrue(first != other)
        assertEquals("p2", database.linkDao().get(other)?.projectUid)
    }

    @Test
    fun `withdrawing a link still queued drops the call`() = runBlocking {
        val draft = LinkDraft("https://a.io/x", sourceType = "inbox_item", sourceUid = "e1")
        repository.addLink(draft, "Ajouter aux liens")

        assertTrue(repository.withdrawLink(draft))

        assertTrue(database.deferredCallDao().all().isEmpty())
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `withdrawing a link already back from the server deletes it by its source`() = runBlocking {
        database.linkDao().upsert(link("l1"))

        assertTrue(repository.withdrawLink(LinkDraft("https://a.io/x", sourceType = "inbox_item", sourceUid = "e1")))

        assertNull(database.linkDao().get("l1"))
        assertEquals(listOf("link" to "l1"), database.outboxDao().pending(100).map { it.entity to it.uid })
    }

    @Test
    fun `withdrawing a link that is neither queued nor back changes nothing`() = runBlocking {
        assertTrue(!repository.withdrawLink(LinkDraft("https://a.io/x", sourceType = "inbox_item", sourceUid = "e9")))
        assertTrue(!repository.withdrawLink(LinkDraft("https://a.io/x")))
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `reopening a processed idea brings it back to the inbox with a status-only upsert`() = runBlocking {
        val uid = repository.captureInbox("https://a.io/x")
        repository.processInboxItem(uid)
        database.outboxDao().deleteByIds(database.outboxDao().pending(100).map { it.opId })

        repository.reopenInboxItem(uid)

        assertEquals(listOf(uid), repository.observeInbox().first().map { it.uid })
        assertEquals(listOf(Triple("inbox_item", uid, mapOf("status" to JsonPrimitive("added")))), pending())
    }
}
