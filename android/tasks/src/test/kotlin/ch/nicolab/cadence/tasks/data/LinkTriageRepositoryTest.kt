package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.model.LinkStatus
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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Étiquettes d'un lien et idée traitée : ligne Room et file d'envoi, sur une base en mémoire. */
@RunWith(AndroidJUnit4::class)
class LinkTriageRepositoryTest {
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

        repository.setLinkStatus("l1", LinkStatus.KEPT)
        repository.processInboxItem(uid)

        assertEquals("kept", database.linkDao().get("l1")?.status)
        assertEquals(listOf("inbox_item", "link", "inbox_item"), pending().map { it.first })
    }

    @Test
    fun `processing an unknown idea writes nothing`() = runBlocking {
        repository.processInboxItem("ghost")

        assertTrue(pending().isEmpty())
    }
}
