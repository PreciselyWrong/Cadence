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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SubtaskRepositoryTest {
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
    fun `a subtask is listed under its parent, renamed in place and removed with its queued delete`() = runBlocking {
        val parent = repository.createTask(TaskDraft(name = "Préparer le voyage"))
        val child = repository.createTask(TaskDraft(name = "Passeport", parentTaskUid = parent))

        assertEquals(listOf(child), repository.observeSubtasks(parent).first().map { it.uid })

        repository.updateTask(child, TaskChange(name = "Passeport et visa"))
        assertEquals("Passeport et visa", repository.observeSubtasks(parent).first().single().name)

        repository.deleteTask(child)
        assertEquals(emptyList<String>(), repository.observeSubtasks(parent).first().map { it.uid })
        assertNull(database.taskDao().get(child))
        assertEquals("delete", database.outboxDao().forUid("task", child).last().action)
    }
}
