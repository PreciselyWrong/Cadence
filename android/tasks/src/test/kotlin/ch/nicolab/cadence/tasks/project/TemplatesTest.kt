package ch.nicolab.cadence.tasks.project

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TemplatesTest {
    @Test
    fun `parses templates list and skips invalid entries`() {
        val json = Json.parseToJsonElement(
            """
            {
              "templates": [
                {"uid":"tpl-1","name":"Lancement","description":"Checklist produit","template_category":"Travail","task_count":5},
                {"uid":"tpl-2","name":"Vacances","description":null,"task_count":2},
                {"uid":"","name":"Sans uid"}
              ]
            }
            """.trimIndent(),
        ).jsonObject

        val list = TemplatesClient.parseList(json)

        assertEquals(2, list.size)
        assertEquals(ProjectTemplate("tpl-1", "Lancement", "Checklist produit", "Travail", 5), list[0])
        assertEquals("Vacances", list[1].name)
        assertEquals("", list[1].description)
        assertNull(list[1].category)
        assertEquals(2, list[1].taskCount)
    }
}
