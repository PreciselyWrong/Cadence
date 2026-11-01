package ch.nicolab.cadence.tasks.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskCopyTest {
    private val source = Json.parseToJsonElement(
        """{"uid":"T","name":"Plan","note":"étapes","status":2,"priority":1,"due_date":"2026-11-03T12:00:00Z",
        "due_has_time":true,"project_uid":"P","area_uid":"A","parent_task_uid":"PARENT","tag_uids":["x"],
        "completed_at":"2026-11-01T10:00:00Z","pinned_at":"2026-11-01T10:00:00Z","reviewed_at":"2026-11-01T10:00:00Z",
        "reminder_at":"2026-11-03T11:00:00Z","field_clocks":{"name":"h"},"estimated_minutes":45,"start_date":"2026-11-02T08:00:00Z",
        "recurrence_exdates":["2026-11-10"],"updated_at":"2026-11-01T10:00:00Z"}""",
    ).jsonObject

    @Test
    fun `une copie garde le contenu, les dates, la durée et les liens, et repart à faire`() {
        val copy = TaskCopy.fields(source)

        assertEquals("Plan", copy.getValue("name").jsonPrimitive.content)
        assertEquals("étapes", copy.getValue("note").jsonPrimitive.content)
        assertEquals("P", copy.getValue("project_uid").jsonPrimitive.content)
        assertEquals("A", copy.getValue("area_uid").jsonPrimitive.content)
        assertEquals("2026-11-03T12:00:00Z", copy.getValue("due_date").jsonPrimitive.content)
        assertEquals("2026-11-02T08:00:00Z", copy.getValue("start_date").jsonPrimitive.content)
        assertEquals("45", copy.getValue("estimated_minutes").jsonPrimitive.content)
        assertEquals(0, copy.getValue("status").jsonPrimitive.content.toInt())
        assertEquals(JsonNull, copy.getValue("completed_at"))
    }

    @Test
    fun `une copie ne reprend ni identité, ni épingle, ni décision, ni rappel, ni parent`() {
        val copy = TaskCopy.fields(source)

        listOf("uid", "pinned_at", "reviewed_at", "reminder_at", "field_clocks", "parent_task_uid", "recurrence_exdates", "updated_at")
            .forEach { assertFalse(it, copy.containsKey(it)) }
        assertTrue(copy.containsKey("tag_uids"))
    }
}
