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
 * Partage vers l'Inbox : l'écran se ferme dès sa création, sans attendre l'écriture ni le réseau ; l'idée
 * arrive ensuite dans Room et dans la file d'envoi, puis le toast « Ajouté à l'Inbox » la confirme.
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

    @Test
    fun `a shared link closes the screen at once, then lands in the inbox and the outbox without the network`() {
        val started = System.nanoTime()
        val activity = Robolectric.buildActivity(TaskQuickAddActivity::class.java, share("https://github.com/a/b")).create().get()
        val elapsedMs = (System.nanoTime() - started) / 1_000_000

        assertTrue("l'écran se ferme sans attendre l'écriture", activity.isFinishing)
        assertTrue("fermé en moins d'une seconde ($elapsedMs ms)", elapsedMs < 1_000)

        awaitUntil { ShadowToast.getTextOfLatestToast() != null }
        assertEquals(listOf("https://github.com/a/b"), inbox().map { it.content })
        val ops = runBlocking { database.outboxDao().pending(10) }
        assertEquals(listOf("inbox_item"), ops.map { it.entity })
        assertEquals("Ajouté à l'Inbox", ShadowToast.getTextOfLatestToast())
        assertEquals(emptyList<String>(), networkCalls.toList())
    }

    @Test
    fun `a share without text keeps its subject`() {
        val activity = Robolectric.buildActivity(TaskQuickAddActivity::class.java, share(null, subject = "  Idée du jour ")).create().get()

        assertTrue(activity.isFinishing)
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
