package ch.nicolab.cadence.tasks.triage

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TriageTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun theQueueOfTheServerIsRead() {
        val queue = json.decodeFromString<TriageQueueDto>(
            """
            {"items":[{"key":"duplicate:a:b","type":"duplicate","source":"rules","task_uid":"a","action":"cancel",
              "payload":null,"reason":"Une autre tâche ouverte porte le même nom.","details":["Celle-ci : projet Maison"],"question":null,"later":1}],
             "tasks":{"a":{"uid":"a","name":"Payer","due_date":"2026-11-07","project_name":"Maison","tags":["x"],"recurring":false,"fingerprint":"f"}},
             "count":1}
            """.trimIndent(),
        )

        assertEquals("cancel", queue.items.single().action)
        assertEquals("Maison", queue.tasks["a"]?.projectName)
        assertEquals("2026-11-07", queue.tasks["a"]?.dueDate)
    }

    @Test
    fun aRecurringTaskCannotBeConvertedOrDeleted() {
        val series = TriageActions.choices(TriageTaskDto(uid = "a", recurring = true))
        assertTrue(TriageActions.DONE in series)
        assertFalse(TriageActions.DELETE in series)
        assertFalse(TriageActions.TO_NOTE in series)
        assertTrue(TriageActions.DELETE in TriageActions.choices(TriageTaskDto(uid = "b")))
    }

    @Test
    fun subtasksAreOnePerLine() {
        assertEquals(listOf("Une", "Deux"), TriageActions.subtasks(" Une \n\n Deux\n"))
    }

    @Test
    fun applyingCarriesTheActionTheCorrectionAndTheKey() {
        val payload = buildJsonObject { put("name", "Trier les papiers") }
        val call = TriageRequests.apply("a", TriageActions.RENAME, payload, "k1", "À trier")

        assertEquals("/api/v1/triage/apply", call.path)
        assertEquals("rename", call.body?.get("action")?.jsonPrimitive?.content)
        assertEquals("k1", call.body?.get("idempotency_key")?.jsonPrimitive?.content)
        assertEquals(JsonPrimitive("Trier les papiers"), call.body?.get("payload")?.jsonObject?.get("name"))
    }

    @Test
    fun aProposedValueIsReadFromThePayload() {
        val payload = buildJsonObject { put("due_date", "2026-11-12") }
        assertEquals("2026-11-12", TriageActions.field(payload, "due_date"))
        assertEquals("", TriageActions.field(payload, "name"))
        assertEquals("", TriageActions.field(null, "name"))
    }
}
