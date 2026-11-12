package ch.nicolab.cadence.tasks.quickadd

import android.content.Context
import android.content.Intent
import android.os.Looper
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.data.ClockStateStore
import ch.nicolab.cadence.tasks.data.RoomTaskRepository
import ch.nicolab.cadence.tasks.data.TududiDatabase
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.SyncApi
import ch.nicolab.cadence.tasks.sync.SyncState
import java.lang.reflect.Proxy
import java.time.ZoneId
import java.util.Collections
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowToast

/**
 * Partage : la feuille s'ouvre au-dessus de l'appli d'origine sans rien écrire ; la quitter range le texte dans
 * l'Inbox (Room et file d'envoi, jamais le réseau), puis le toast « Ajouté à l'Inbox » le confirme. Tâche et Liens
 * s'écrivent hors ligne, une seule fois par partage.
 */
@RunWith(AndroidJUnit4::class)
class ShareCaptureTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val networkCalls = Collections.synchronizedList(mutableListOf<String>())
    private lateinit var database: TududiDatabase

    @Before
    fun setUp() {
        runCatching { WorkManager.initialize(context, Configuration.Builder().build()) }
        database = Room.inMemoryDatabaseBuilder(context, TududiDatabase::class.java).allowMainThreadQueries().build()
        TasksGraph.replaceRepository(
            RoomTaskRepository(
                context = context,
                database = database,
                api = recording<SyncApi>(),
                hlc = Hlc("test"),
                clockState = ClockStateStore(context),
                connection = recording<ServerConnection>(),
                syncState = MutableStateFlow(SyncState()),
                deviceZone = MutableStateFlow(ZoneId.of("UTC")),
                nowMs = { 1_000L },
            ),
        )
    }

    @After
    fun tearDown() {
        TasksGraph.replaceRepository(null)
        database.close()
    }

    /** Toute méthode réseau appelée est notée, puis échoue : le chemin du partage ne doit en appeler aucune. */
    private inline fun <reified T : Any> recording(): T = Proxy.newProxyInstance(T::class.java.classLoader, arrayOf(T::class.java)) { _, method, _ ->
        networkCalls += method.name
        error("réseau : ${method.name}")
    } as T

    private fun share(text: String?, subject: String? = null) = Intent(context, TaskQuickAddActivity::class.java)
        .setAction(Intent.ACTION_SEND)
        .setType("text/plain")
        .apply {
            text?.let { putExtra(Intent.EXTRA_TEXT, it) }
            subject?.let { putExtra(Intent.EXTRA_SUBJECT, it) }
        }

    private fun inbox() = runBlocking { database.inboxDao().observeAll().first().map { it.item } }

    /** Laisse tourner l'écriture d'arrière-plan et le fil principal jusqu'à [done], au plus 2 s. */
    private fun awaitUntil(done: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 2_000
        while (!done() && System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(5)
        }
        shadowOf(Looper.getMainLooper()).idle()
    }

    private fun ops() = runBlocking { database.outboxDao().pending(10) }

    @Test
    fun `a share opens the sheet without writing, leaving it saves to the inbox without the network`() {
        val controller = Robolectric.buildActivity(TaskQuickAddActivity::class.java, share("https://github.com/a/b")).create().start().resume()
        val activity = controller.get()

        assertTrue("la feuille reste ouverte", !activity.isFinishing)
        assertTrue(inbox().isEmpty())

        controller.pause().stop()

        assertTrue(activity.isFinishing)
        awaitUntil { ShadowToast.getTextOfLatestToast() != null }
        assertEquals(listOf("https://github.com/a/b"), inbox().map { it.content })
        assertEquals(listOf("inbox_item"), ops().map { it.entity })
        assertEquals("Ajouté à l'Inbox", ShadowToast.getTextOfLatestToast())
        assertEquals(emptyList<String>(), networkCalls.toList())
    }

    @Test
    fun `a shared repository address becomes a task named Essayer that waits for Quand`() {
        val controller = Robolectric.buildActivity(TaskQuickAddActivity::class.java, share("https://github.com/acme/rocket")).create().start().resume()
        val session = controller.get().share

        assertTrue(session.settle(ShareAction.TASK, pageTitle = null))
        controller.pause().stop()

        awaitUntil { ShadowToast.getTextOfLatestToast() != null }
        val task = runBlocking { database.taskDao().get(ops().single().uid) }!!
        assertEquals("Essayer : acme/rocket", task.name)
        assertTrue(task.needsWhen)
        assertEquals(listOf("task"), ops().map { it.entity })
        assertEquals(emptyList<String>(), networkCalls.toList())
    }

    @Test
    fun `a decision is written once, leaving afterwards adds nothing to the inbox`() {
        val controller = Robolectric.buildActivity(TaskQuickAddActivity::class.java, share("https://github.com/a/b pour les logs")).create().start().resume()
        val session = controller.get().share

        assertTrue(session.settle(ShareAction.TASK, pageTitle = "a/b"))
        controller.pause().stop()

        awaitUntil { ShadowToast.getTextOfLatestToast() != null }
        assertTrue(inbox().isEmpty())
        val task = runBlocking { database.taskDao().get(ops().single().uid) }!!
        assertEquals("Essayer : a/b", task.name)
        assertEquals("https://github.com/a/b\n\npour les logs", task.note)
        assertEquals(listOf("task"), ops().map { it.entity })
        assertEquals("Tâche créée", ShadowToast.getTextOfLatestToast())
        assertTrue(!session.settle(ShareAction.INBOX, null))
    }

    @Test
    fun `Projet writes the page into its project, offline, with no deferred call`() = runBlocking {
        val repository = TasksGraph.repository(context)
        val write = ShareCapture.plan(ShareAction.LINK, "https://a.io/x", "A", listOf("t1"), "p1", ShareCapture.verbs(context))

        ShareCapture.write(repository, write)

        val page = database.linkDao().inProject("p1").single()
        assertEquals("https://a.io/x", page.url)
        assertEquals("A", page.title)
        assertEquals(listOf("link"), ops().map { it.entity })
        assertTrue(database.deferredCallDao().all().isEmpty())
        assertTrue(inbox().isEmpty())
        assertEquals(emptyList<String>(), networkCalls.toList())
    }

    @Test
    fun `Tâche keeps the chosen tags and project`() = runBlocking {
        val repository = TasksGraph.repository(context)

        ShareCapture.write(repository, ShareCapture.plan(ShareAction.TASK, "Acheter du pain", null, listOf("t1"), "p1", ShareCapture.verbs(context)))

        val task = database.taskDao().get(ops().single().uid)!!
        assertEquals("Acheter du pain", task.name)
        assertEquals("p1", task.projectUid)
        assertEquals(null, task.note)
        val fields = ops().single().payloadJson
        assertTrue(fields.contains("\"tag_uids\""))
        assertTrue(fields.contains("t1"))
    }

    @Test
    fun `a share without text keeps its subject`() {
        val controller = Robolectric.buildActivity(TaskQuickAddActivity::class.java, share(null, subject = "  Idée du jour ")).create().start().resume()

        assertEquals("Idée du jour", controller.get().share.text)
        controller.pause().stop()
        awaitUntil { inbox().isNotEmpty() }
        assertEquals(listOf("Idée du jour"), inbox().map { it.content })
    }

    @Test
    fun `a blank share closes without writing anything`() {
        val activity = Robolectric.buildActivity(TaskQuickAddActivity::class.java, share("   ")).create().get()

        assertTrue(activity.isFinishing)
        repeat(20) { shadowOf(Looper.getMainLooper()).idle(); Thread.sleep(5) }
        assertEquals(emptyList<String>(), inbox().map { it.content })
        assertEquals(emptyList<String>(), networkCalls.toList())
    }
}
