package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ConnectionInfo
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalChange
import ch.nicolab.cadence.tasks.model.GoalStatus
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.sync.AccountProfile
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.PullPage
import ch.nicolab.cadence.tasks.sync.PushResult
import ch.nicolab.cadence.tasks.sync.SnapshotPage
import ch.nicolab.cadence.tasks.sync.SyncApi
import ch.nicolab.cadence.tasks.sync.SyncState
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Édition, suppression d'objectifs et d'envies, et tâche créée depuis une envie : ligne Room et file d'envoi. */
@RunWith(AndroidJUnit4::class)
class GoalEditsRepositoryTest {
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
            deviceZone = MutableStateFlow(ZoneId.of("UTC")),
            nowMs = { 1_000L },
        )
    }

    @After
    fun tearDown() = database.close()

    private fun goal(uid: String, bucket: String? = null, parent: String? = null, why: String? = null) =
        GoalEntity(uid, "Titre $uid", why, "season", null, "active", null, bucket, null, parent)

    private fun pending() = runBlocking { database.outboxDao().pending(100) }.map { op ->
        val payload = Json.parseToJsonElement(op.payloadJson).jsonObject
        Triple(op.entity, op.uid, payload["fields"]?.jsonObject?.mapValues { (_, f) -> f.jsonObject.getValue("value") })
    }

    @Test
    fun `editing a wish writes the row and one upsert with only the changed fields`() = runBlocking {
        database.goalDao().upsert(goal("w", bucket = "do"))

        repository.updateGoal("w", GoalChange(title = "Voir le Japon", why = "Les cerisiers", bucket = GoalBucket.BE, status = GoalStatus.ACHIEVED))

        val row = database.goalDao().get("w")!!
        assertEquals("Voir le Japon", row.title)
        assertEquals("Les cerisiers", row.why)
        assertEquals("be", row.bucket)
        assertEquals("achieved", row.status)
        val op = pending().single()
        assertEquals("goal", op.first)
        assertEquals("w", op.second)
        assertEquals(setOf("title", "why", "bucket", "status"), op.third!!.keys)
        assertEquals("be", op.third!!.getValue("bucket").jsonPrimitive.content)
        assertEquals("achieved", op.third!!.getValue("status").jsonPrimitive.content)
    }

    @Test
    fun `a blank why clears it and unchanged fields are not sent`() = runBlocking {
        database.goalDao().upsert(goal("w", bucket = "do", why = "Ancien"))

        repository.updateGoal("w", GoalChange(title = "Titre w", why = "  "))

        assertNull(database.goalDao().get("w")!!.why)
        val fields = pending().single().third!!
        assertEquals(setOf("why"), fields.keys)
        assertEquals(JsonNull, fields.getValue("why"))
    }

    @Test
    fun `an unknown goal, a blank title or no change writes nothing`() = runBlocking {
        database.goalDao().upsert(goal("w", bucket = "do"))

        repository.updateGoal("ghost", GoalChange(title = "X"))
        repository.updateGoal("w", GoalChange(title = "   "))
        repository.updateGoal("w", GoalChange(title = "Titre w", status = GoalStatus.ACTIVE))

        assertEquals("Titre w", database.goalDao().get("w")!!.title)
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `deleting an objective removes it and its key results locally and sends one delete`() = runBlocking {
        database.goalDao().upsert(goal("o"))
        database.goalDao().upsert(goal("k", parent = "o"))
        database.goalDao().upsert(goal("w", bucket = "do"))

        repository.deleteGoal("o")

        assertNull(database.goalDao().get("o"))
        assertNull(database.goalDao().get("k"))
        assertEquals("w", database.goalDao().get("w")?.uid)
        val ops = runBlocking { database.outboxDao().pending(100) }
        assertEquals(listOf("goal" to "o"), ops.map { it.entity to it.uid })
        assertEquals("delete", ops.single().action)
    }

    @Test
    fun `a task created from a wish carries the goal link`() = runBlocking {
        val uid = repository.createTask(TaskDraft(name = "Réserver le vol", goalUid = "w"))

        val op = pending().single()
        assertEquals("task", op.first)
        assertEquals("w", op.third!!.getValue("goal_uid").jsonPrimitive.content)
        assertEquals("w", TaskExtras.parse(database.taskDao().get(uid)!!.extrasJson)["goal_uid"])
    }

    @Test
    fun `a task without a goal sends no goal link`() = runBlocking {
        repository.createTask(TaskDraft(name = "Seule"))

        assertFalse(pending().single().third!!.containsKey("goal_uid"))
    }

    private object NoApi : SyncApi {
        override suspend fun meta(): JsonObject = error("hors ligne")
        override suspend fun profile(): AccountProfile = error("hors ligne")
        override suspend fun snapshot(entity: String, after: Long, cursor: Long?, limit: Int): SnapshotPage = error("hors ligne")
        override suspend fun pull(cursor: Long, limit: Int): PullPage = error("hors ligne")
        override suspend fun push(ops: List<JsonObject>): List<PushResult> = error("hors ligne")
        override suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String) = error("hors ligne")
        override suspend fun send(method: String, path: String, body: JsonObject?): JsonObject = error("hors ligne")
    }

    private object NoConnection : ServerConnection {
        override fun observe(): Flow<ConnectionInfo?> = emptyFlow()
        override suspend fun connect(serverUrl: String, token: String): Result<ConnectionInfo> = error("hors ligne")
        override suspend fun disconnect() = Unit
        override fun observeForeignHabits(): Flow<Boolean> = emptyFlow()
        override suspend fun keepForeignHabitsLocal() = Unit
        override suspend fun deleteForeignHabits() = Unit
    }
}
