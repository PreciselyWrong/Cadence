package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.sync.HttpError
import java.io.IOException
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FocusExceptionsTest {
    private val monday = LocalDate.of(2026, 11, 2)
    private val wednesday = monday.plusDays(2)
    private val work = FocusBlock(
        "Employeur", LocalTime.of(7, 30), LocalTime.of(18, 0),
        setOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY), id = "work",
    )
    private val swim = FocusBlock("Piscine", LocalTime.of(12, 0), LocalTime.of(13, 0), setOf(DayOfWeek.WEDNESDAY), id = "swim")

    @Test
    fun `the blocks of the weekday hold unless an exception frees them`() {
        val plain = PlanningSettings(focusBlocks = listOf(work, swim))
        assertEquals(listOf(work), plain.focusBlocksOn(monday))
        assertEquals(listOf(work, swim), plain.focusBlocksOn(wednesday))

        val holidays = plain.copy(focusExceptions = listOf(FocusException(monday, wednesday)))
        assertEquals(emptyList<FocusBlock>(), holidays.focusBlocksOn(monday))
        assertEquals(emptyList<FocusBlock>(), holidays.focusBlocksOn(wednesday))
        assertEquals(listOf(work), holidays.focusBlocksOn(monday.plusDays(7)))

        val dayOff = plain.copy(focusExceptions = listOf(FocusException(wednesday, wednesday, setOf("work"))))
        assertEquals(listOf(swim), dayOff.focusBlocksOn(wednesday))
        assertEquals(listOf(work), dayOff.focusBlocksOn(monday))
    }

    @Test
    fun `day plan leaves freed blocks out of the busy time`() {
        val settings = PlanningSettings(focusBlocks = listOf(work), focusExceptions = listOf(FocusException(monday, monday)))
        assertEquals(emptyList<Slot>(), DayPlans.focusSlots(monday, settings))
        assertEquals(listOf(work.slot), DayPlans.focusSlots(monday.plusDays(1), settings))
    }

    @Test
    fun `server JSON round-trips with Sunday as 0 and midnight as 1440`() {
        val body = json(
            """{"blocks":[{"id":"work","days":[1,2,3],"start":450,"end":1080,"label":"Employeur"},
            {"id":"late","days":[0],"start":1380,"end":1440}],
            "exceptions":[{"id":"h","start":"2026-12-21","end":"2027-01-03","block_ids":null,"label":"Vacances"},
            {"id":"d","start":"2026-11-11","end":"2026-11-11","block_ids":["work"]}]}""",
        )
        val (blocks, exceptions) = FocusJson.parse(body)
        assertEquals(work.copy(label = "Employeur"), blocks[0])
        assertEquals(setOf(DayOfWeek.SUNDAY), blocks[1].days)
        assertEquals(FocusException(LocalDate.of(2026, 12, 21), LocalDate.of(2027, 1, 3), null, "Vacances", "h"), exceptions[0])
        assertEquals(setOf("work"), exceptions[1].blockIds)

        assertEquals(body, FocusJson.body(blocks, exceptions))
    }

    private class FakeCache(var state: FocusState = FocusState(emptyList(), emptyList(), FocusPending.NONE)) : FocusCache {
        override fun focus() = state
        override fun setFocus(blocks: List<FocusBlock>, exceptions: List<FocusException>, pending: FocusPending) {
            state = FocusState(blocks, exceptions, pending)
        }
    }

    private class FakeServer(var failure: Exception? = null, vararg replies: String) {
        private val replies = ArrayDeque(replies.toList())
        val calls = mutableListOf<String>()
        val bodies = mutableListOf<JsonObject?>()
        suspend fun call(method: String, path: String, query: Map<String, String>, body: JsonObject?): JsonObject {
            calls += "$method $path"
            bodies += body
            failure?.let { throw it }
            return Json.parseToJsonElement(replies.removeFirst()).jsonObject
        }
    }

    private val workJson = """{"id":"work","days":[1,2,3],"start":450,"end":1080,"label":"Employeur"}"""

    @Test
    fun `blocks kept on the phone before the update are sent when the server has none`() = runTest {
        val cache = FakeCache(FocusState(listOf(work.copy(id = "")), emptyList(), FocusPending.LEGACY))
        val server = FakeServer(null, """{"blocks":[],"exceptions":[]}""", """{"blocks":[$workJson],"exceptions":[]}""")

        FocusRepository(cache, server::call, backgroundScope).sync()

        assertEquals(listOf("GET $PATH", "PUT $PATH"), server.calls)
        assertEquals(FocusState(listOf(work), emptyList(), FocusPending.NONE), cache.state)
    }

    @Test
    fun `blocks kept on the phone never replace the server's, even after an edit before the first sync`() = runTest {
        val cache = FakeCache(FocusState(listOf(swim.copy(id = "")), emptyList(), FocusPending.LEGACY))
        val server = FakeServer(
            null,
            """{"blocks":[$workJson],"exceptions":[{"id":"h","start":"2026-12-21","end":"2027-01-03","block_ids":null}]}""",
        )
        val repository = FocusRepository(cache, server::call, backgroundScope, saveDelayMs = 0)

        repository.edit(listOf(swim.copy(id = "", label = "Natation")), emptyList())
        assertEquals(FocusPending.LEGACY, cache.state.pending)
        repository.sync()

        assertEquals(listOf("GET $PATH"), server.calls)
        assertEquals(listOf("work"), cache.state.blocks.map { it.id })
        assertEquals(1, cache.state.exceptions.size)
    }

    @Test
    fun `an edit is kept as pending until the server takes it, then keeps the typed text`() = runTest {
        val cache = FakeCache()
        val offline = FakeServer(IOException("hors ligne"))
        val exception = FocusException(monday, wednesday, label = "Vacances ")
        FocusRepository(cache, offline::call, backgroundScope, saveDelayMs = 0).run {
            edit(listOf(work), listOf(exception))
            sync()
        }
        assertEquals(FocusPending.EDITED, cache.state.pending)

        val online = FakeServer(
            null,
            """{"blocks":[$workJson],"exceptions":[{"id":"e1","start":"2026-11-02","end":"2026-11-04","block_ids":null,"label":"Vacances"}]}""",
        )
        FocusRepository(cache, online::call, backgroundScope).sync()

        assertEquals(listOf("PUT $PATH"), online.calls)
        assertEquals(FocusJson.body(listOf(work), listOf(exception)), online.bodies.single())
        assertEquals(FocusPending.NONE, cache.state.pending)
        assertEquals(exception.copy(id = "e1"), cache.state.exceptions.single())
    }

    @Test
    fun `a refused edit is dropped and the server's version comes back`() = runTest {
        val cache = FakeCache(FocusState(listOf(work), emptyList(), FocusPending.EDITED))
        var refuse = true
        val server = FakeServer(null, """{"blocks":[$workJson],"exceptions":[]}""")
        val repository = FocusRepository(cache, { method, path, query, body ->
            if (method == "PUT" && refuse) {
                refuse = false
                throw HttpError(400, "invalid")
            }
            server.call(method, path, query, body)
        }, backgroundScope)

        repository.sync()

        assertEquals(FocusPending.NONE, cache.state.pending)
        assertEquals(listOf(work), cache.state.blocks)
        assertTrue(repository.error.value != null)
    }

    @Test
    fun `a read never undoes an edit that is still to send`() = runTest {
        val cache = FakeCache(FocusState(listOf(work.copy(label = "Travail")), emptyList(), FocusPending.EDITED))
        val server = FakeServer(HttpError(503, null))

        FocusRepository(cache, server::call, backgroundScope).sync()

        assertEquals("Travail", cache.state.blocks.single().label)
        assertEquals(FocusPending.EDITED, cache.state.pending)
    }

    private companion object {
        const val PATH = "/api/v1/daily-plan/focus-blocks"
    }

    private fun json(text: String) = Json.parseToJsonElement(text).jsonObject
}
