package ch.nicolab.cadence.tasks.review

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.time.Instant
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReviewRepositoryTest {
    private val dir: File = Files.createTempDirectory("review-cache").toFile()
    private val summary = """{"counts":{"pushed":1,"undecided":0,"later":2,"review_due":0,"projects":0,"stale":0},
        "attention_total":1,"decided_this_week":0,"week_start":"2026-10-26"}"""

    private class FakeServer(var online: Boolean, val body: String) {
        val calls = mutableListOf<String>()
        suspend fun call(method: String, path: String, query: Map<String, String>, body: JsonObject?): JsonObject {
            calls += "$method $path"
            if (!online) throw IOException("hors ligne")
            return Json.parseToJsonElement(this.body).jsonObject
        }
    }

    @Test
    fun `offline the last list read is shown again, flagged as cached`() = runTest {
        val server = FakeServer(online = true, body = summary)
        val at = Instant.parse("2026-10-31T08:00:00Z")
        val repository = ReviewRepository(server::call, ReviewCache(dir)) { at }

        val first = repository.summary().getOrThrow()
        assertFalse(first.fromCache)
        assertEquals(2, first.value.counts.later)

        server.online = false
        val second = repository.summary().getOrThrow()
        assertTrue(second.fromCache)
        assertEquals(2, second.value.counts.later)
        assertEquals(at, second.fetchedAt)
        assertEquals(listOf("GET /api/v1/review", "GET /api/v1/review"), server.calls)
    }

    @Test
    fun `offline without any earlier read is a failure`() = runTest {
        val repository = ReviewRepository(FakeServer(online = false, body = summary)::call, ReviewCache(dir))
        assertTrue(repository.week().isFailure)
    }

    @Test
    fun `keeping a project calls the review endpoint`() = runTest {
        val server = FakeServer(online = true, body = "{}")
        val repository = ReviewRepository(server::call, ReviewCache(dir))
        assertTrue(repository.keepProject("p 1").isSuccess)
        assertTrue(repository.saveWeekCapacity(360).isSuccess)
        assertEquals(listOf("POST /api/v1/project/p+1/reviewed", "PUT /api/v1/review/week/capacity"), server.calls)
        server.online = false
        assertTrue(repository.keepProject("p1").isFailure)
    }

    @Test
    fun `the Friday routine is read and planned online only`() = runTest {
        val server = FakeServer(online = true, body = """{"exists":false}""")
        val repository = ReviewRepository(server::call, ReviewCache(dir))

        assertEquals(false, repository.weeklyRoutineExists().getOrThrow())
        assertTrue(repository.planWeeklyRoutine("Revue hebdo").isSuccess)
        assertEquals(listOf("GET /api/v1/review/weekly-routine", "POST /api/v1/review/weekly-routine"), server.calls)

        val offline = ReviewRepository(FakeServer(online = false, body = "{}")::call, ReviewCache(dir))
        assertTrue(offline.weeklyRoutineExists().isFailure)
        assertTrue(offline.planWeeklyRoutine("Revue hebdo").isFailure)
    }

    @Test
    fun `an existing routine is reported as such`() = runTest {
        val repository = ReviewRepository(FakeServer(online = true, body = """{"exists":true}""")::call, ReviewCache(dir))
        assertEquals(true, repository.weeklyRoutineExists().getOrThrow())
    }
}
