package ch.nicolab.cadence.tasks.todomd

import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodoMdClientTest {
    private val calls = mutableListOf<String>()
    private val repo = """{"slug":"a b","repo":"git.example/a","project_uid":"p1","synced_at":null,"last_error":null,"pending":[]}"""

    private fun client(answer: () -> String) = TodoMdClient { method, path, _, _ ->
        calls += "$method $path"
        Json.parseToJsonElement(answer()).jsonObject as JsonObject
    }

    @Test
    fun `l'état, réessayer et abandonner passent par les routes du serveur`() = runTest {
        assertEquals("a b", client { """{"enabled":true,"repos":[$repo]}""" }.status().getOrThrow().single().slug)
        assertEquals("p1", client { repo }.retry("a b").getOrThrow()?.projectUid)
        client { repo }.discard("a b")

        assertEquals(
            listOf("GET /api/v1/todo-md/status", "POST /api/v1/todo-md/repos/a%20b/retry", "POST /api/v1/todo-md/repos/a%20b/discard"),
            calls,
        )
    }

    @Test
    fun `lister, rattacher et détacher passent par les routes du serveur`() = runTest {
        val listed = client { """{"files":[{"folder":"a b","path":"a b/TODO.md"}]}""" }.files().getOrThrow()
        assertEquals("a b", listed.single().folder)
        assertTrue(client { "{}" }.link("p 1", "a b").isSuccess)
        assertTrue(client { "{}" }.unlink("p 1").isSuccess)

        assertEquals(
            listOf("GET /api/v1/todo-md/files", "POST /api/v1/todo-md/projects/p%201/link", "POST /api/v1/todo-md/projects/p%201/unlink"),
            calls,
        )
    }

    @Test
    fun `hors ligne, l'état est un échec et non un plantage`() = runTest {
        val offline = TodoMdClient { _, _, _, _ -> throw IOException("hors ligne") }
        assertTrue(offline.status().isFailure)
    }
}
