package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.TaskChange
import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FunnelWireTest {
    private val now = "2026-10-31T10:00:00Z"

    @Test
    fun `the four decision fields have their own columns and leave the extras`() {
        val wire = Json.parseToJsonElement(
            """{"uid":"t1","name":"Idée","in_view_at":"2026-10-30T08:00:00.000Z","week_of":"2026-10-26",
            "review_on":"2026-12-01","reviewed_at":"2026-10-29T18:00:00.000Z","estimated_minutes":30}""",
        ).jsonObject
        val row = WireCodec.taskFromWire(wire)
        assertEquals("2026-10-30T08:00:00.000Z", row.inViewAtRaw)
        assertEquals("2026-10-26", row.weekOf)
        assertEquals("2026-12-01", row.reviewOn)
        assertEquals("2026-10-29T18:00:00.000Z", row.reviewedAtRaw)
        val extras = TaskExtras.parse(row.extrasJson)
        assertFalse("in_view_at" in extras || "week_of" in extras || "review_on" in extras || "reviewed_at" in extras)
        assertEquals("30", extras["estimated_minutes"])

        val back = WireCodec.taskToWire(row)
        assertEquals("2026-10-26", back.getValue("week_of").jsonPrimitive.content)
        assertEquals("2026-12-01", back.getValue("review_on").jsonPrimitive.content)
        assertEquals("2026-10-30T08:00:00.000Z", back.getValue("in_view_at").jsonPrimitive.content)
        assertEquals("2026-10-29T18:00:00.000Z", back.getValue("reviewed_at").jsonPrimitive.content)
    }

    @Test
    fun `a project keeps its review stamp when the server sends it`() {
        val wire = Json.parseToJsonElement("""{"uid":"p1","name":"Alpha","reviewed_at":"2026-10-20T10:00:00.000Z"}""").jsonObject
        assertEquals("2026-10-20T10:00:00.000Z", WireCodec.projectFromWire(wire).reviewedAtRaw)
    }

    @Test
    fun `putting in view stamps now, once`() {
        val fresh = TaskFields.decision(TaskChange(inView = true), inViewAtRaw = null, tagUids = emptyList(), somedayUid = null, nowIso = now)
        assertEquals(now, fresh.getValue("in_view_at").jsonPrimitive.content)
        val again = TaskFields.decision(TaskChange(inView = true), inViewAtRaw = "2026-10-01T00:00:00Z", tagUids = emptyList(), somedayUid = null, nowIso = now)
        assertFalse("in_view_at" in again)
        val out = TaskFields.decision(TaskChange(inView = false), inViewAtRaw = "2026-10-01T00:00:00Z", tagUids = emptyList(), somedayUid = null, nowIso = now)
        assertEquals(JsonNull, out.getValue("in_view_at"))
    }

    @Test
    fun `week, review date and review stamp are plain fields`() {
        val fields = TaskFields.decision(
            TaskChange(weekOf = LocalDate.of(2026, 10, 26), reviewOn = LocalDate.of(2026, 11, 30), reviewed = true),
            inViewAtRaw = null, tagUids = emptyList(), somedayUid = null, nowIso = now,
        )
        assertEquals("2026-10-26", fields.getValue("week_of").jsonPrimitive.content)
        assertEquals("2026-11-30", fields.getValue("review_on").jsonPrimitive.content)
        assertEquals(now, fields.getValue("reviewed_at").jsonPrimitive.content)

        val cleared = TaskFields.decision(
            TaskChange(clearWeek = true, clearReviewOn = true),
            inViewAtRaw = null, tagUids = emptyList(), somedayUid = null, nowIso = now,
        )
        assertEquals(JsonNull, cleared.getValue("week_of"))
        assertEquals(JsonNull, cleared.getValue("review_on"))
        assertFalse("reviewed_at" in cleared)
    }

    @Test
    fun `later adds the someday tag and wins over view and week`() {
        val fields = TaskFields.decision(
            TaskChange(later = true, inView = true, weekOf = LocalDate.of(2026, 10, 26)),
            inViewAtRaw = null, tagUids = listOf("a"), somedayUid = "s", nowIso = now,
        )
        assertEquals(JsonNull, fields.getValue("in_view_at"))
        assertEquals(JsonNull, fields.getValue("week_of"))
        assertEquals(listOf("a", "s"), fields.getValue("tag_uids").jsonArray.map { it.jsonPrimitive.content })
    }

    @Test
    fun `leaving later removes the tag and keeps the others`() {
        val fields = TaskFields.decision(TaskChange(later = false), inViewAtRaw = null, tagUids = listOf("a", "s"), somedayUid = "s", nowIso = now)
        assertEquals(listOf("a"), fields.getValue("tag_uids").jsonArray.map { it.jsonPrimitive.content })
        val untouched = TaskFields.decision(TaskChange(later = false), inViewAtRaw = null, tagUids = listOf("a"), somedayUid = "s", nowIso = now)
        assertNull(untouched["tag_uids"])
    }

    @Test
    fun `later twice does not duplicate the tag`() {
        val fields = TaskFields.decision(TaskChange(later = true), inViewAtRaw = null, tagUids = listOf("s"), somedayUid = "s", nowIso = now)
        assertNull(fields["tag_uids"])
        assertEquals(JsonNull, fields.getValue("in_view_at"))
    }

    @Test
    fun `needs_when is read from the wire and written back, false included`() {
        val wire = Json.parseToJsonElement("""{"uid":"t1","name":"Facture","area_uid":"a1","needs_when":true}""").jsonObject
        val row = WireCodec.taskFromWire(wire)
        assertTrue(row.needsWhen)
        assertFalse("needs_when" in TaskExtras.parse(row.extrasJson))
        assertEquals(JsonPrimitive(true), WireCodec.taskToWire(row).getValue("needs_when"))

        val cleared = WireCodec.taskFromWire(Json.parseToJsonElement("""{"uid":"t1","needs_when":false}""").jsonObject)
        assertFalse(cleared.needsWhen)
        assertEquals(JsonPrimitive(false), WireCodec.taskToWire(cleared).getValue("needs_when"))

        val absent = WireCodec.taskFromWire(Json.parseToJsonElement("""{"uid":"t2"}""").jsonObject)
        assertFalse(absent.needsWhen)
    }
}
