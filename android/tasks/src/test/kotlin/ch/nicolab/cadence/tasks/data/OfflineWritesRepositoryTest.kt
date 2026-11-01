package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.model.Delivery
import ch.nicolab.cadence.tasks.model.LinkStatus
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.sync.ConflictRecord
import ch.nicolab.cadence.tasks.sync.Hlc
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
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sans réseau (le serveur ne répond à rien), chaque écriture réussit : ligne Room et file d'envoi ; un appel
 * qui demande le serveur rejoint la file des appels différés. Les conflits se règlent depuis la base.
 */
@RunWith(AndroidJUnit4::class)
class OfflineWritesRepositoryTest {
    private lateinit var database: TududiDatabase
    private lateinit var repository: RoomTaskRepository
    private val online = MutableStateFlow(false)

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
            online = online,
        )
    }

    @After
    fun tearDown() = database.close()

    private fun queued() = runBlocking { database.outboxDao().pending(500) }.map { it.entity to it.action }

    @Test
    fun `every write path works with no network and lands in the outbox`() = runBlocking {
        database.projectDao().upsert(ProjectEntity("p1", "Maison", "in_progress", null, null, false))
        database.linkDao().upsert(WireCodec.linkFromWire(Json.parseToJsonElement("""{"uid":"l1","url":"https://a.io","tag_uids":[]}""").jsonObject))

        val task = repository.createTask(TaskDraft(name = "Acheter du pain", projectUid = "p1"))
        repository.updateTask(task, TaskChange(name = "Acheter du pain complet"))
        repository.updateTask(task, TaskChange(weekOf = LocalDate.of(2026, 11, 2), reviewed = true))
        repository.completeTask(task)
        repository.reopenTask(task)
        repository.setProjectStatus("p1", ProjectStatus.WAITING)
        repository.saveNote("n1", NoteChange(title = "Idées", content = "texte"))
        val idea = repository.captureInbox("Lire https://a.io")
        repository.processInboxItem(idea)
        repository.setLinkNote("l1", "à tester")
        repository.setLinkStatus("l1", LinkStatus.KEPT)
        repository.createArea("Perso")
        repository.deleteTask(task)

        val entities = queued().map { it.first }.toSet()
        assertEquals(setOf("task", "project", "note", "inbox_item", "link", "area"), entities)
        assertEquals("kept", database.linkDao().get("l1")!!.status)
        assertEquals(null, database.taskDao().get(task))
    }

    @Test
    fun `moving a recurring occurrence offline is deferred, not an error`() = runBlocking {
        database.taskDao().upsert(
            WireCodec.taskFromWire(
                Json.parseToJsonElement(
                    """{"uid":"T","name":"Courses","status":0,"due_date":"2026-11-02T08:00:00.000Z","due_has_time":true,
                    "tag_uids":[],"recurrence_type":"weekly","recurrence_interval":1}""",
                ).jsonObject,
            ),
        )

        val result = repository.moveRecurring("T", RecurringScope.THIS, LocalDate.of(2026, 11, 4))

        assertEquals(Delivery.QUEUED, result.getOrThrow())
        val call = database.deferredCallDao().all().single()
        assertEquals("POST", call.method)
        assertEquals("/api/v1/task/T/move-occurrence", call.path)
        assertTrue(call.bodyJson!!.contains("2026-11-04"))
    }

    @Test
    fun `the status line says offline with what is waiting`() = runBlocking {
        repository.captureInbox("une idée")
        repository.defer(ch.nicolab.cadence.tasks.sync.DeferredCall("week-capacity", "PUT", "/x", null, "Temps"))

        assertEquals(SyncStatus.Offline(null, 2), repository.observeSyncStatus().first())
        online.value = true
        assertEquals(SyncStatus.Idle(null, 2), repository.observeSyncStatus().first())
    }

    @Test
    fun `a lost conflict shows both values, by name, and keeping the phone value sends it again`() = runBlocking {
        val store = RoomSyncStore(database, ClockStateStore(ApplicationProvider.getApplicationContext()), nowMs = { 5L })
        database.projectDao().upsert(ProjectEntity("p1", "Maison", "in_progress", null, null, false))
        database.projectDao().upsert(ProjectEntity("p2", "Bureau", "in_progress", null, null, false))
        val task = repository.createTask(TaskDraft(name = "Écrit sur le web"))
        database.outboxDao().deleteByIds(database.outboxDao().pending(10).map { it.opId })
        store.recordConflict(ConflictRecord("task", task, "project_uid", JsonPrimitive("p1"), JsonPrimitive("p2"), "op-1"))
        store.recordConflict(ConflictRecord("task", task, "name", JsonPrimitive("Écrit hors ligne"), JsonPrimitive("Écrit sur le web"), "op-1"))

        val conflicts = repository.observeConflicts().first()
        val project = conflicts.single { it.fieldLabel == "Projet" }
        assertEquals("Maison", project.localText)
        assertEquals("Bureau", project.serverText)
        assertEquals("Écrit sur le web", project.name)

        val name = conflicts.single { it.fieldLabel == "Titre" }
        repository.resolveConflict(name.id, keepLocal = true)
        repository.resolveConflict(project.id, keepLocal = false)

        assertEquals("Écrit hors ligne", database.taskDao().get(task)!!.name)
        val op = Json.parseToJsonElement(database.outboxDao().pending(10).single().payloadJson).jsonObject
        val field = op.getValue("fields").jsonObject.getValue("name").jsonObject
        assertEquals("Écrit hors ligne", field.getValue("value").jsonPrimitive.content)
        assertNotEquals("", field.getValue("hlc").jsonPrimitive.content)
        assertTrue(repository.observeConflicts().first().isEmpty())
    }
}
