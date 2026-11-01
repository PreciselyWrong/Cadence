package ch.nicolab.cadence.tasks.review

import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** « Session courte » de la revue, comme le web : la tâche rejoint le plan d'aujourd'hui, 25 min, sans heure. */
class ShortSessionTest {
    private val plan = Json.parseToJsonElement(
        """{"date":"2026-11-01","plan":{"date":"2026-11-01","items":[
            {"task_uid":"a","position":0,"start_minute":540,"duration_minutes":60,"task":{"name":"A"}},
            {"task_uid":"t","position":1,"start_minute":600,"duration_minutes":30},
            {"task_uid":"b","position":2,"start_minute":null,"duration_minutes":30}
        ]}}""",
    ).jsonObject

    @Test
    fun `garde le plan, retire la tâche s'il l'avait, et l'ajoute à la fin pour 25 min sans heure`() {
        val body = ShortSession.body(plan, "t")
        assertEquals(
            Json.parseToJsonElement(
                """{"items":[
                    {"task_uid":"a","start_minute":540,"duration_minutes":60},
                    {"task_uid":"b","start_minute":null,"duration_minutes":30},
                    {"task_uid":"t","start_minute":null,"duration_minutes":25}
                ]}""",
            ),
            body,
        )
        assertEquals("2026-11-01", ShortSession.date(plan))
    }

    @Test
    fun `un jour sans plan ne garde que la session`() {
        val empty = Json.parseToJsonElement("""{"date":"2026-11-01","plan":null}""").jsonObject
        assertEquals(
            Json.parseToJsonElement("""{"items":[{"task_uid":"t","start_minute":null,"duration_minutes":25}]}"""),
            ShortSession.body(empty, "t"),
        )
    }

    @Test
    fun `lit le plan du jour puis le remplace, hors ligne rien n'est écrit`() = runTest {
        val calls = mutableListOf<Pair<String, JsonObject?>>()
        var online = true
        val call: suspend (String, String, Map<String, String>, JsonObject?) -> JsonObject = { method, path, _, body ->
            calls += "$method $path" to body
            if (!online) throw IOException("hors ligne")
            if (method == "GET") plan else JsonObject(emptyMap())
        }
        val repository = ReviewRepository(call, ReviewCache(Files.createTempDirectory("review").toFile()))

        assertTrue(repository.shortSession("t").isSuccess)
        assertEquals(listOf("GET /api/v1/daily-plan", "PUT /api/v1/daily-plan/2026-11-01"), calls.map { it.first })
        assertEquals(ShortSession.body(plan, "t"), calls[1].second)

        online = false
        calls.clear()
        assertTrue(repository.shortSession("t").isFailure)
        assertEquals(listOf("GET /api/v1/daily-plan"), calls.map { it.first })
    }
}
