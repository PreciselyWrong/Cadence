package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncApi
import ch.nicolab.cadence.tasks.sync.SyncState
import java.lang.reflect.Proxy
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Pages de projet et décisions de l'Inbox : ligne Room, file d'envoi et appels différés, sur une base en mémoire. */
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

    private fun link(uid: String, projectUid: String? = "p1") = LinkEntity(
        uid = uid,
        url = "https://a.io/x",
        title = "A",
        description = null,
        imageUrl = null,
        siteName = null,
        kind = "tool",
        githubStars = null,
        githubLanguage = null,
        githubLastCommitRaw = null,
        readmeExcerpt = null,
        note = null,
        fetchStatus = "done",
        createdAtRaw = null,
        projectUid = projectUid,
    )

    private fun pending() = runBlocking { database.outboxDao().pending(100) }.map { op ->
        val payload = Json.parseToJsonElement(op.payloadJson).jsonObject
        Triple(op.entity, op.uid, payload.getValue("fields").jsonObject.mapValues { (_, f) -> f.jsonObject.getValue("value") })
    }

    @Test
    fun `a new title and note are written and queued, an empty title goes back to the page`() = runBlocking {
        database.linkDao().upsert(link("l1"))

        repository.setLinkTitle("l1", "  Mon nom ")
        repository.setLinkNote("l1", "  à relire ")

        assertEquals("Mon nom", database.linkDao().get("l1")?.title)
        assertEquals("à relire", database.linkDao().get("l1")?.note)
        assertEquals(listOf(setOf("title"), setOf("note")), pending().map { it.third.keys })

        repository.setLinkTitle("l1", "  ")
        assertEquals(null, database.linkDao().get("l1")?.title)
    }

    @Test
    fun `deleting removes the row and queues the delete`() = runBlocking {
        database.linkDao().upsert(link("l1"))

        repository.deleteLink("l1")

        assertEquals(null, database.linkDao().get("l1"))
        val op = database.outboxDao().pending(100).single()
        assertEquals("link", op.entity)
        assertEquals("l1", op.uid)
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
    fun `processing an unknown idea writes nothing`() = runBlocking {
        repository.processInboxItem("ghost")
        repository.reopenInboxItem("ghost")

        assertTrue(pending().isEmpty())
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
    fun `reopening a processed idea brings it back to the inbox with a status-only upsert`() = runBlocking {
        val uid = repository.captureInbox("https://a.io/x")
        repository.processInboxItem(uid)
        database.outboxDao().deleteByIds(database.outboxDao().pending(100).map { it.opId })

        repository.reopenInboxItem(uid)

        assertEquals(listOf(uid), repository.observeInbox().first().map { it.uid })
        assertEquals(listOf(Triple("inbox_item", uid, mapOf("status" to JsonPrimitive("added")))), pending())
    }
}
