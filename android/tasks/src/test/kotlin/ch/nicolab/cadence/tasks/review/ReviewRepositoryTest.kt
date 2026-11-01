package ch.nicolab.cadence.tasks.review

import ch.nicolab.cadence.tasks.model.Delivery
import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.sync.HttpError
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
    fun `keeping a project calls the review endpoint, and waits for the network when offline`() = runTest {
        val server = FakeServer(online = true, body = "{}")
        val deferred = mutableListOf<DeferredCall>()
        val repository = ReviewRepository(server::call, ReviewCache(dir), defer = { deferred += it })
        assertEquals(Delivery.SENT, repository.keepProject("p 1").getOrThrow())
        assertEquals(Delivery.SENT, repository.saveWeekCapacity(360).getOrThrow())
        assertEquals(listOf("POST /api/v1/project/p+1/reviewed", "PUT /api/v1/review/week/capacity"), server.calls)
        server.online = false
        assertEquals(Delivery.QUEUED, repository.keepProject("p1", "Maison").getOrThrow())
        assertEquals(Delivery.QUEUED, repository.saveWeekCapacity(null).getOrThrow())
        assertEquals(listOf("project-reviewed:p1", "week-capacity"), deferred.map { it.key })
        assertEquals("/api/v1/project/p1/reviewed", deferred[0].path)
        assertEquals("Garder tel quel : Maison", deferred[0].label)
        assertEquals("""{"capacity_minutes":null}""", deferred[1].body.toString())
    }

    @Test
    fun `a refusal from the server stays a failure instead of being queued`() = runTest {
        val deferred = mutableListOf<DeferredCall>()
        val refusing: suspend (String, String, Map<String, String>, JsonObject?) -> JsonObject = { _, _, _, _ -> throw HttpError(400, "invalid") }
        val repository = ReviewRepository(refusing, ReviewCache(dir), defer = { deferred += it })
        assertTrue(repository.saveWeekCapacity(30).isFailure)
        assertTrue(deferred.isEmpty())
    }

    @Test
    fun `the Friday routine is read online and planned even offline`() = runTest {
        val server = FakeServer(online = true, body = """{"exists":false}""")
        val repository = ReviewRepository(server::call, ReviewCache(dir))

        assertEquals(false, repository.weeklyRoutineExists().getOrThrow())
        assertEquals(Delivery.SENT, repository.planWeeklyRoutine("Revue hebdo").getOrThrow())
        assertEquals(listOf("GET /api/v1/review/weekly-routine", "POST /api/v1/review/weekly-routine"), server.calls)

        val deferred = mutableListOf<DeferredCall>()
        val offline = ReviewRepository(FakeServer(online = false, body = "{}")::call, ReviewCache(dir), defer = { deferred += it })
        assertTrue(offline.weeklyRoutineExists().isFailure)
        assertEquals(Delivery.QUEUED, offline.planWeeklyRoutine("Revue hebdo").getOrThrow())
        assertEquals("""{"name":"Revue hebdo"}""", deferred.single().body.toString())
    }

    @Test
    fun `an existing routine is reported as such`() = runTest {
        val repository = ReviewRepository(FakeServer(online = true, body = """{"exists":true}""")::call, ReviewCache(dir))
        assertEquals(true, repository.weeklyRoutineExists().getOrThrow())
    }
}
