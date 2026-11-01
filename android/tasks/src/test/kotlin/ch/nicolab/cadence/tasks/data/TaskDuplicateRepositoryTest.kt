package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncState
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TaskDuplicateRepositoryTest {
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

    @Test
    fun `a copy keeps the content, dates, duration and project, gets a new uid and is open and unpinned`() = runBlocking {
        val original = repository.createTask(TaskDraft(name = "Rapport", note = "chiffres", dueDate = LocalDate.of(2026, 11, 3), dueTime = "09:00", priority = 2, projectUid = "p1", tagUids = listOf("t1")))
        repository.updateTask(original, TaskChange(estimatedMinutes = 45, pinned = true))
        repository.completeTask(original)

        val copy = repository.duplicateTask(original)!!

        assertNotEquals(original, copy)
        val copied = database.taskDao().get(copy)!!
        val source = database.taskDao().get(original)!!
        assertEquals("Rapport", copied.name)
        assertEquals("chiffres", copied.note)
        assertEquals(2, copied.priority)
        assertEquals("p1", copied.projectUid)
        assertEquals(source.dueDateRaw, copied.dueDateRaw)
        assertEquals("45", Json.parseToJsonElement(copied.extrasJson).jsonObject["estimated_minutes"]!!.jsonPrimitive.content)
        assertEquals(0, copied.status)
        assertNull(copied.completedAtRaw)
        assertNull(copied.pinnedAtRaw)
        assertEquals(TaskStatus.DONE, source.status)
        assertNotNull(source.pinnedAtRaw)
    }

    @Test
    fun `the copy is queued for the server as its own task`() = runBlocking {
        val original = repository.createTask(TaskDraft(name = "Rapport"))

        val copy = repository.duplicateTask(original)!!

        val ops = database.outboxDao().pending(50).filter { it.entity == "task" && it.uid == copy }
        assertEquals(1, ops.size)
        assertEquals("upsert", ops.single().action)
    }

    @Test
    fun `duplicating a task that no longer exists does nothing`() = runBlocking {
        assertNull(repository.duplicateTask("absente"))
    }
}
