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
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Texte d'une idée modifié : ligne Room et file d'envoi, sur une base en mémoire. */
@RunWith(AndroidJUnit4::class)
class InboxIdeaRepositoryTest {
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

    private inline fun <reified T : Any> offline(): T = Proxy.newProxyInstance(T::class.java.classLoader, arrayOf(T::class.java)) { _, method, _ ->
        when (method.returnType) {
            java.lang.Boolean.TYPE -> false
            java.lang.Integer.TYPE -> 0
            else -> null
        }
    } as T

    private fun pending() = runBlocking { database.outboxDao().pending(100) }.map { op ->
        val payload = Json.parseToJsonElement(op.payloadJson).jsonObject
        Triple(op.entity, op.uid, payload.getValue("fields").jsonObject.mapValues { (_, f) -> f.jsonObject.getValue("value") })
    }

    @Test
    fun `renaming an idea writes its text and sends a content upsert`() = runBlocking {
        val uid = repository.captureInbox("Idée brute")
        database.outboxDao().deleteByIds(database.outboxDao().pending(100).map { it.opId })

        repository.renameInboxItem(uid, "Idée précisée")

        assertEquals("Idée précisée", database.inboxDao().get(uid)?.content)
        assertEquals(listOf(Triple("inbox_item", uid, mapOf("content" to JsonPrimitive("Idée précisée")))), pending())
    }

    @Test
    fun `renaming an unknown idea writes nothing`() = runBlocking {
        repository.renameInboxItem("ghost", "Texte")

        assertTrue(pending().isEmpty())
    }
}
