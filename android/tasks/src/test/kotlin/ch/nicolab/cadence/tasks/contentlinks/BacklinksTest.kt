package ch.nicolab.cadence.tasks.contentlinks

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class BacklinksTest {
    @Test
    fun `les rétroliens d'une réponse, sans les entrées incomplètes`() = runTest {
        var asked = ""
        val client = BacklinksClient { _, path, _ ->
            asked = path
            Json.parseToJsonElement(
                """[{"type":"note","uid":"n1","title":"Voyage","snippet":"… Liste …","updated_at":"x"},
                {"type":"task","uid":"t1","title":"Valise","snippet":""},{"type":"person","uid":"p","title":"x"},{"type":"note","uid":"n2"}]""",
            )
        }
        assertEquals(
            listOf(Backlink("note", "n1", "Voyage", "… Liste …"), Backlink("task", "t1", "Valise", null)),
            client.of("note", "abc"),
        )
        assertEquals("/api/v1/note/abc/backlinks", asked)
        assertEquals(emptyList<Backlink>(), BacklinksClient.parse(Json.parseToJsonElement("""{"error":"x"}""")))
    }
}
