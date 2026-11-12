package ch.nicolab.cadence.tasks.links

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

class PageChecksTest {
    private fun response(text: String): JsonObject = Json.parseToJsonElement(text) as JsonObject

    @Test
    fun `lit chaque page avec son état et son code, et retient les seules pages mortes`() {
        val results = PageChecks.parse(
            response(
                """{"results":[
                    {"uid":"a","url":"https://a.io/gone","state":"dead","code":404},
                    {"uid":"b","url":"https://b.io/down","state":"dead","code":null},
                    {"uid":"c","url":"https://c.io/login","state":"ok","code":403},
                    {"uid":"d","url":"https://d.io/?","state":"surprise","code":null}
                ]}""",
            ),
        )

        assertEquals(listOf("a", "b"), PageChecks.dead(results).map { it.uid })
        assertEquals(PageState.UNKNOWN, results.last().state)
        assertEquals(403, results[2].code)
    }

    @Test
    fun `une réponse sans liste donne aucune page`() {
        assertEquals(emptyList<PageCheck>(), PageChecks.parse(response("{}")))
    }
}
