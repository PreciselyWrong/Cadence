package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ConnectionInfo
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.model.TagEditProblem
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
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Écritures d'icône, de parent et de nom de projets et d'étiquettes : ligne Room et file d'envoi, sur une base en mémoire. */
@RunWith(AndroidJUnit4::class)
class EntityEditsRepositoryTest {
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

    private fun project(uid: String, parent: String? = null, icon: String? = null) =
        ProjectEntity(uid, uid, "in_progress", null, null, false, icon = icon, parentProjectUid = parent)

    private fun tag(name: String, icon: String? = null) = TagEntity(name, name, null, icon)

    private fun pending() = runBlocking { database.outboxDao().pending(100) }.map { op ->
        val payload = Json.parseToJsonElement(op.payloadJson).jsonObject
        Triple(op.entity, op.uid, payload.getValue("fields").jsonObject.mapValues { (_, f) -> f.jsonObject.getValue("value") })
    }

    @Test
    fun `setting a project icon writes the row and one icon-only upsert`() = runBlocking {
        database.projectDao().upsert(project("p1"))

        repository.setProjectIcon("p1", "home")

        assertEquals("home", database.projectDao().get("p1")?.icon)
        val op = pending().single()
        assertEquals("project", op.first)
        assertEquals("p1", op.second)
        assertEquals(setOf("icon"), op.third.keys)
        assertEquals("home", op.third.getValue("icon").jsonPrimitive.content)
    }

    @Test
    fun `removing a project icon sends a null icon`() = runBlocking {
        database.projectDao().upsert(project("p1", icon = "home"))

        repository.setProjectIcon("p1", null)

        assertNull(database.projectDao().get("p1")?.icon)
        assertEquals(JsonNull, pending().single().third.getValue("icon"))
    }

    @Test
    fun `an unchanged or unknown project icon writes nothing`() = runBlocking {
        database.projectDao().upsert(project("p1", icon = "home"))

        repository.setProjectIcon("p1", "home")
        repository.setProjectIcon("ghost", "home")

        assertTrue(pending().isEmpty())
    }

    @Test
    fun `an icon id the server would refuse is rejected before any write`() = runBlocking {
        database.projectDao().upsert(project("p1"))
        database.tagDao().upsert(tag("a"))

        assertThrows(IllegalArgumentException::class.java) { runBlocking { repository.setProjectIcon("p1", "Not An Id") } }
        assertThrows(IllegalArgumentException::class.java) { runBlocking { repository.setTagIcon("a", "x".repeat(41)) } }

        assertNull(database.projectDao().get("p1")?.icon)
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `choosing and clearing a tag color sends tag upserts`() = runBlocking {
        database.tagDao().upsert(tag("sport"))

        repository.setTagColor("sport", "#2563EB")
        repository.setTagColor("sport", "#2563eb")
        repository.setTagColor("sport", null)

        assertNull(database.tagDao().get("sport")?.color)
        val ops = pending()
        assertEquals(listOf("tag", "tag"), ops.map { it.first })
        assertEquals("#2563eb", ops[0].third.getValue("color").jsonPrimitive.content)
        assertEquals(JsonNull, ops[1].third.getValue("color"))
    }

    @Test
    fun `a tag color the server would not store is rejected before any write`() = runBlocking {
        database.tagDao().upsert(tag("sport"))

        assertThrows(IllegalArgumentException::class.java) { runBlocking { repository.setTagColor("sport", "blue") } }
        repository.setTagColor("ghost", "#2563eb")

        assertNull(database.tagDao().get("sport")?.color)
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `setting and removing a tag icon sends tag upserts`() = runBlocking {
        database.tagDao().upsert(tag("sport"))

        repository.setTagIcon("sport", "fitness")
        repository.setTagIcon("sport", null)

        assertNull(database.tagDao().get("sport")?.icon)
        val ops = pending()
        assertEquals(listOf("tag", "tag"), ops.map { it.first })
        assertEquals("fitness", ops[0].third.getValue("icon").jsonPrimitive.content)
        assertEquals(JsonNull, ops[1].third.getValue("icon"))
    }

    @Test
    fun `moving a project sets its parent with one parent upsert and moving it to the top level clears it`() = runBlocking {
        database.projectDao().upsert(project("a"))
        database.projectDao().upsert(project("b"))

        assertTrue(repository.moveProject("b", "a"))
        assertEquals("a", database.projectDao().get("b")?.parentProjectUid)
        assertTrue(repository.moveProject("b", null))
        assertNull(database.projectDao().get("b")?.parentProjectUid)

        val ops = pending()
        assertEquals(setOf("parent_project_uid"), ops[0].third.keys)
        assertEquals("a", ops[0].third.getValue("parent_project_uid").jsonPrimitive.content)
        assertEquals(JsonNull, ops[1].third.getValue("parent_project_uid"))
    }

    @Test
    fun `a project cannot move under itself or one of its sub-projects`() = runBlocking {
        database.projectDao().upsert(project("a"))
        database.projectDao().upsert(project("b", parent = "a"))
        database.projectDao().upsert(project("c", parent = "b"))

        assertFalse(repository.moveProject("a", "a"))
        assertFalse(repository.moveProject("a", "c"))
        assertFalse(repository.moveProject("a", "ghost"))
        assertFalse(repository.moveProject("ghost", "a"))

        assertNull(database.projectDao().get("a")?.parentProjectUid)
        assertTrue(pending().isEmpty())
    }

    @Test
    fun `moving a project to the parent it already has writes nothing`() = runBlocking {
        database.projectDao().upsert(project("a"))
        database.projectDao().upsert(project("b", parent = "a"))

        assertTrue(repository.moveProject("b", "a"))

        assertTrue(pending().isEmpty())
    }

    @Test
    fun `renaming a tag renames its subtree locally but sends only the renamed tag`() = runBlocking {
        listOf("perso", "perso/sport", "perso/sport/course", "travail").forEach { database.tagDao().upsert(tag(it)) }

        assertNull(repository.renameTag("perso", "vie"))

        val names = database.tagDao().all().map { it.name }.toSet()
        assertEquals(setOf("vie", "vie/sport", "vie/sport/course", "travail"), names)
        val op = pending().single()
        assertEquals("tag", op.first)
        assertEquals("perso", op.second)
        assertEquals(mapOf("name" to "vie"), op.third.mapValues { it.value.jsonPrimitive.content })
    }

    @Test
    fun `moving a tag under another rebuilds its path and keeps its children under it`() = runBlocking {
        listOf("perso", "perso/sport", "perso/sport/course", "travail").forEach { database.tagDao().upsert(tag(it)) }

        assertNull(repository.moveTag("perso/sport", "travail"))

        assertEquals(
            setOf("perso", "travail", "travail/sport", "travail/sport/course"),
            database.tagDao().all().map { it.name }.toSet(),
        )
        assertEquals("travail", database.tagDao().get("perso/sport")?.parentUid)
        assertEquals("perso/sport", database.tagDao().get("perso/sport/course")?.parentUid)
        val op = pending().single()
        assertEquals("perso/sport", op.second)
        assertEquals("travail/sport", op.third.getValue("name").jsonPrimitive.content)
    }

    @Test
    fun `moving a tag to the root keeps its last segment`() = runBlocking {
        listOf("perso", "perso/sport").forEach { database.tagDao().upsert(tag(it)) }

        assertNull(repository.moveTag("perso/sport", null))

        assertEquals("sport", database.tagDao().get("perso/sport")?.name)
        assertNull(database.tagDao().get("perso/sport")?.parentUid)
    }

    @Test
    fun `refused tag edits write nothing`() = runBlocking {
        listOf("perso", "perso/sport", "travail", "someday").forEach { database.tagDao().upsert(tag(it)) }

        assertEquals(TagEditProblem.INTO_SELF, repository.moveTag("perso", "perso/sport"))
        assertEquals(TagEditProblem.INTO_SELF, repository.renameTag("perso", "perso/autre"))
        assertEquals(TagEditProblem.CLASH, repository.renameTag("perso", "travail"))
        assertEquals(TagEditProblem.INVALID, repository.renameTag("perso", "a//b"))
        assertEquals(TagEditProblem.UNCHANGED, repository.renameTag("perso", "perso"))
        assertEquals(TagEditProblem.RESERVED, repository.renameTag("someday", "plus-tard"))
        assertEquals(TagEditProblem.UNKNOWN, repository.renameTag("ghost", "x"))

        assertEquals(setOf("perso", "perso/sport", "travail", "someday"), database.tagDao().all().map { it.name }.toSet())
        assertTrue(pending().isEmpty())
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
