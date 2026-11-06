package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.domain.ReminderLead
import ch.nicolab.cadence.tasks.sync.HttpError
import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TimedRemindersRepositoryTest {
    private class FakeCache(var settings: TimedReminders = TimedReminders(), var waiting: Boolean = false) : TimedRemindersCache {
        override fun read() = settings
        override fun pending() = waiting
        override fun save(settings: TimedReminders, pending: Boolean) {
            this.settings = settings
            waiting = pending
        }
    }

    private class FakeServer(private val failure: Exception? = null, private val reply: String = """{"enabled":true,"lead_minutes":0}""") {
        val calls = mutableListOf<String>()
        var sent: JsonObject? = null

        suspend fun call(method: String, path: String, query: Map<String, String>, body: JsonObject?): JsonObject {
            calls += "$method $path"
            if (method == "PUT") {
                failure?.let { throw it }
                sent = body
                return body!!
            }
            return Json.parseToJsonElement(reply).jsonObject
        }
    }

    private val path = "/api/v1/notifications/timed-tasks"
    private val tenBefore = TimedReminders(enabled = true, lead = ReminderLead.TEN_MINUTES)

    @Test
    fun `the server's setting replaces the phone's when nothing waits`() = runTest {
        val cache = FakeCache()
        val server = FakeServer(reply = """{"enabled":false,"lead_minutes":15}""")

        TimedRemindersRepository(cache, server::call, backgroundScope).sync()

        assertEquals(listOf("GET $path"), server.calls)
        assertEquals(TimedReminders(enabled = false, lead = ReminderLead.FIFTEEN_MINUTES), cache.settings)
    }

    @Test
    fun `a change made on the phone is sent to the server`() = runTest {
        val cache = FakeCache(tenBefore, waiting = true)
        val server = FakeServer()

        TimedRemindersRepository(cache, server::call, backgroundScope).sync()

        assertEquals(listOf("PUT $path"), server.calls)
        assertEquals("""{"enabled":true,"lead_minutes":10}""", server.sent.toString())
        assertEquals(tenBefore, cache.settings)
        assertFalse(cache.waiting)
    }

    @Test
    fun `offline the change stays on the phone, waiting`() = runTest {
        val cache = FakeCache(tenBefore, waiting = true)

        TimedRemindersRepository(cache, FakeServer(IOException("hors ligne"))::call, backgroundScope).sync()

        assertEquals(tenBefore, cache.settings)
        assertTrue(cache.waiting)
    }

    @Test
    fun `a server without the setting yet keeps the change waiting`() = runTest {
        val cache = FakeCache(tenBefore, waiting = true)

        TimedRemindersRepository(cache, FakeServer(HttpError(404, null))::call, backgroundScope).sync()

        assertTrue(cache.waiting)
    }

    @Test
    fun `a refused change gives way to the server's setting`() = runTest {
        val cache = FakeCache(tenBefore, waiting = true)
        val server = FakeServer(HttpError(400, "refus"), """{"enabled":false,"lead_minutes":0}""")

        TimedRemindersRepository(cache, server::call, backgroundScope).sync()

        assertEquals(TimedReminders(enabled = false, lead = ReminderLead.AT_TIME), cache.settings)
        assertFalse(cache.waiting)
    }

    @Test
    fun `edit keeps the choice at once and marks it to send`() = runTest {
        val cache = FakeCache()

        TimedRemindersRepository(cache, FakeServer(IOException("hors ligne"))::call, backgroundScope).edit(tenBefore)

        assertEquals(tenBefore, cache.settings)
        assertTrue(cache.waiting)
    }
}
