package ch.nicolab.cadence.tasks.handoff

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.domain.handoff.HandoffRequest
import ch.nicolab.cadence.domain.handoff.ProchesHandoff
import ch.nicolab.cadence.tasks.data.ClockStateStore
import ch.nicolab.cadence.tasks.data.Connected
import ch.nicolab.cadence.tasks.data.RoomTaskRepository
import ch.nicolab.cadence.tasks.data.TududiDatabase
import ch.nicolab.cadence.tasks.data.Unreachable
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncState
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProchesTaskHandoffTest {
    private lateinit var database: TududiDatabase
    private lateinit var repository: RoomTaskRepository
    private val request = HandoffRequest("prop-1", "Appeler Marie", LocalDate.of(2026, 11, 12))

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

    private fun pendingTaskOps() = runBlocking { database.outboxDao().pending(500) }.count { it.entity == "task" }

    @Test
    fun `a handed off proposal is stored once with its uid, title and due date`() = runBlocking {
        ProchesTaskHandoff.store(repository, request)

        val task = repository.observeTask(ProchesHandoff.taskUid("prop-1")).first()
        assertNotNull(task)
        assertEquals("Appeler Marie", task!!.name)
        assertNotNull(task.dueDate)
        assertEquals(1, pendingTaskOps())
    }

    @Test
    fun `handing off the same proposal again creates nothing new`() = runBlocking {
        assertEquals(true, ProchesTaskHandoff.store(repository, request))
        assertEquals(true, ProchesTaskHandoff.store(repository, request))

        assertEquals(1, pendingTaskOps())
    }
}
