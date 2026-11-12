package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.model.PlaceRef
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncApi
import ch.nicolab.cadence.tasks.sync.SyncState
import java.lang.reflect.Proxy
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Tâche née d'un lien (champs de synchro) et « Déjà dans » (`placesOf`), sur une base en mémoire, hors ligne. */
@RunWith(AndroidJUnit4::class)
class TaskCaptureRepositoryTest {
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
        error("hors ligne : ${method.name}")
    } as T

    private fun taskFields(uid: String): Map<String, kotlinx.serialization.json.JsonElement> {
        val op = runBlocking { database.outboxDao().pending(100) }.single { it.entity == "task" && it.uid == uid }
        // Chaque champ part avec son horloge : `{ value, hlc }`.
        return Json.parseToJsonElement(op.payloadJson).jsonObject.getValue("fields").jsonObject
            .mapValues { (_, field) -> field.jsonObject.getValue("value") }
    }

    @Test
    fun `a task born from a link sends needs_when, source and source_url`() = runBlocking {
        val uid = repository.createTask(
            TaskDraft(name = "Essayer : acme/rocket", note = "https://github.com/acme/rocket", needsWhen = true, source = "link", sourceUrl = "https://github.com/acme/rocket"),
        )

        val fields = taskFields(uid)
        assertEquals("true", fields.getValue("needs_when").toString())
        assertEquals("\"link\"", fields.getValue("source").toString())
        assertEquals("\"https://github.com/acme/rocket\"", fields.getValue("source_url").toString())
        assertTrue(database.taskDao().get(uid)!!.needsWhen)
    }

    @Test
    fun `a task without origin sends none of the three fields`() = runBlocking {
        val uid = repository.createTask(TaskDraft(name = "Acheter du pain"))

        val fields = taskFields(uid)
        assertFalse(fields.containsKey("needs_when"))
        assertFalse(fields.containsKey("source"))
        assertFalse(fields.containsKey("source_url"))
    }

    private fun task(uid: String, name: String, note: String?, status: Int = 0) = ch.nicolab.cadence.tasks.data.TaskEntity(
        uid = uid, name = name, note = note, status = status, priority = null, dueDateRaw = null, dueHasTime = false,
        deferUntilRaw = null, reminderAtRaw = null, recurrenceType = null, projectUid = null, areaUid = null,
        parentTaskUid = null, tagUidsJson = "[]", completedAtRaw = null, pinnedAtRaw = null,
        fieldClocksJson = "{}", extrasJson = "{}",
    )

    @Test
    fun `placesOf finds the open tasks that cite the same page, and the projects that saved it`() = runBlocking {
        database.taskDao().upsert(task("t1", "Rocket", "https://www.github.com/acme/rocket/#readme"))
        database.taskDao().upsert(task("done", "Rocket fini", "https://github.com/acme/rocket", status = 2))
        database.taskDao().upsert(task("launcher", "rocket-launcher", "https://github.com/acme/rocket-launcher"))
        database.projectDao().upsert(ProjectEntity("p1", "Fusée", null, null, null, false))
        database.linkDao().upsert(
            LinkEntity(
                uid = "l1", url = "https://www.github.com/acme/rocket/#readme", title = null, description = null, imageUrl = null,
                siteName = null, kind = "repo", githubStars = null, githubLanguage = null, githubLastCommitRaw = null,
                readmeExcerpt = null, note = null, status = "new", tagUidsJson = "[]", sourceType = null, sourceUid = null,
                fetchStatus = null, createdAtRaw = null, projectUid = "p1",
            ),
        )

        val places = repository.placesOf("https://github.com/acme/rocket?utm_source=x")

        assertEquals(listOf(PlaceRef("t1", "Rocket")), places.tasks)
        assertEquals(listOf(PlaceRef("p1", "Fusée")), places.projects)
        assertFalse(places.isEmpty)
    }

    @Test
    fun `placesOf is empty for an address nobody has, and for a non-web text`() = runBlocking {
        database.taskDao().upsert(task("t1", "Rocket", "https://github.com/acme/rocket"))

        assertTrue(repository.placesOf("https://github.com/acme/other").isEmpty)
        assertTrue(repository.placesOf("pas une adresse").isEmpty)
    }
}
