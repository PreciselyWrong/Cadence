package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncState
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TaskPinRepositoryTest {
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
            api = Unreachable,
            hlc = Hlc("test"),
            clockState = ClockStateStore(context),
            connection = Connected,
            syncState = MutableStateFlow(SyncState()),
            deviceZone = MutableStateFlow(ZoneId.of("Europe/Paris")),
            nowMs = { 1_000L },
            online = MutableStateFlow(false),
        )
    }

    @After
    fun tearDown() = database.close()

    /** Valeur écrite pour [field] par la dernière opération de la file pour [uid]. */
    private fun sent(uid: String, field: String): JsonElement = runBlocking {
        val op = Json.parseToJsonElement(database.outboxDao().forUid("task", uid).last().payloadJson).jsonObject
        op.getValue("fields").jsonObject.getValue(field).jsonObject.getValue("value")
    }

    @Test
    fun `pinning writes pinned_at through the outbox and unpinning clears it`() = runBlocking {
        val uid = repository.createTask(TaskDraft(name = "Important"))

        repository.updateTask(uid, TaskChange(pinned = true))

        assertNotNull(database.taskDao().get(uid)!!.pinnedAtRaw)
        assertEquals("1970-01-01T00:00:01Z", sent(uid, "pinned_at").jsonPrimitive.content)

        repository.updateTask(uid, TaskChange(pinned = false))

        assertNull(database.taskDao().get(uid)!!.pinnedAtRaw)
        assertTrue(sent(uid, "pinned_at") is JsonNull)
    }
}
