package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ConnectionInfo
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.sync.AccountProfile
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.PullPage
import ch.nicolab.cadence.tasks.sync.PushResult
import ch.nicolab.cadence.tasks.sync.SnapshotPage
import ch.nicolab.cadence.tasks.sync.SyncApi
import ch.nicolab.cadence.tasks.sync.SyncState
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Modifier ou supprimer une occurrence sans réseau : lignes Room et opérations d'envoi, sur une base en mémoire. */
@RunWith(AndroidJUnit4::class)
class RecurringEditsRepositoryTest {
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
            api = NoApi,
            hlc = Hlc("test"),
            clockState = ClockStateStore(context),
            connection = NoConnection,
            syncState = MutableStateFlow(SyncState()),
            deviceZone = MutableStateFlow(ZoneId.of("Europe/Paris")),
            nowMs = { 1_000L },
        )
        runBlocking {
            database.taskDao().upsert(
                WireCodec.taskFromWire(
                    Json.parseToJsonElement(
                        """{"uid":"T","name":"Courses","status":0,"due_date":"2026-11-02T08:00:00.000Z","due_has_time":true,
                        "tag_uids":[],"recurrence_type":"weekly","recurrence_interval":1,"recurrence_weekday":1}""",
                    ).jsonObject,
                ),
            )
        }
    }

    @After
    fun tearDown() = database.close()

    private fun ops() = runBlocking { database.outboxDao().pending(100) }.map { Json.parseToJsonElement(it.payloadJson).jsonObject }

    @Test
    fun `renaming only this later occurrence writes a one-off row and leaves the day out, with no network`() = runBlocking {
        val result = repository.editRecurring(
            "T", RecurringScope.THIS, LocalDate.of(2026, 11, 16), TaskChange(name = "Courses bio", estimatedMinutes = 45),
        )

        assertTrue(result.isSuccess)
        val rows = database.taskDao().observeEvery().first().map { it.task }.sortedBy { it.uid }
        assertEquals(2, rows.size)
        val created = rows.first { it.uid != "T" }
        assertEquals("Courses bio", created.name)
        assertEquals("none", created.recurrenceType)
        assertEquals("2026-11-16T08:00:00Z", created.dueDateRaw)
        assertEquals("Courses", rows.first { it.uid == "T" }.name)
        assertTrue(rows.first { it.uid == "T" }.extrasJson.contains("2026-11-16"))
        val pending = ops()
        assertEquals(listOf(created.uid, "T"), pending.map { it.getValue("uid").jsonPrimitive.content })
        assertEquals("upsert", pending[0].getValue("action").jsonPrimitive.content)
        val fields = pending[0].getValue("fields").jsonObject
        assertEquals("45", fields.getValue("estimated_minutes").jsonObject.getValue("value").jsonPrimitive.content)
    }

    @Test
    fun `deleting this current occurrence sends skip_occurrence and deleting all removes the row`() = runBlocking {
        assertTrue(repository.deleteRecurring("T", RecurringScope.THIS, null).isSuccess)
        val skip = ops().single()
        assertEquals("skip_occurrence", skip.getValue("action").jsonPrimitive.content)
        assertEquals("2026-11-02T08:00:00.000Z", skip.getValue("occurrence_date").jsonPrimitive.content)

        assertTrue(repository.deleteRecurring("T", RecurringScope.ALL, null).isSuccess)
        assertNull(database.taskDao().get("T"))
        assertEquals("delete", ops().last().getValue("action").jsonPrimitive.content)
    }

    @Test
    fun `an unknown task or an unsupported rule fails without writing`() = runBlocking {
        assertTrue(repository.editRecurring("ghost", RecurringScope.ALL, null, TaskChange(name = "x")).isFailure)
        database.taskDao().upsert(database.taskDao().get("T")!!.copy(recurrenceType = "yearly"))

        val failure = repository.editRecurring("T", RecurringScope.THIS, LocalDate.of(2027, 11, 2), TaskChange(name = "x"))

        assertTrue(failure.exceptionOrNull() is UnsupportedRecurrence)
        assertTrue(ops().isEmpty())
    }

    private object NoApi : SyncApi {
        override suspend fun meta(): JsonObject = error("hors ligne")
        override suspend fun profile(): AccountProfile = error("hors ligne")
        override suspend fun snapshot(entity: String, after: Long, cursor: Long?, limit: Int): SnapshotPage = error("hors ligne")
        override suspend fun pull(cursor: Long, limit: Int): PullPage = error("hors ligne")
        override suspend fun push(ops: List<JsonObject>): List<PushResult> = error("hors ligne")
        override suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String) = error("hors ligne")
    }

    private object NoConnection : ServerConnection {
        override fun observe(): Flow<ConnectionInfo?> = flowOf(null)
        override suspend fun connect(serverUrl: String, token: String): Result<ConnectionInfo> = error("hors ligne")
        override suspend fun disconnect() = Unit
        override fun observeForeignHabits(): Flow<Boolean> = flowOf(false)
        override suspend fun keepForeignHabitsLocal() = Unit
        override suspend fun deleteForeignHabits() = Unit
    }
}
