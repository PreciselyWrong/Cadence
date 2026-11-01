package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.RecurringScope
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RecurringEditsTest {
    private val paris = ZoneId.of("Europe/Paris")
    private val zones = Zones(account = paris, device = paris)
    private val today = LocalDate.of(2026, 11, 1)
    private val now = Instant.parse("2026-11-01T10:00:00Z")

    // Série hebdomadaire du lundi à 09:00 (Paris), occurrence courante le lundi 2 novembre 2026.
    private fun weekly(extra: String = "") = Json.parseToJsonElement(
        """{"uid":"T","name":"Courses","note":"lait","status":0,"priority":1,
        "due_date":"2026-11-02T08:00:00.000Z","due_has_time":true,"project_uid":"p1","area_uid":"a1",
        "tag_uids":["t1","t2"],"estimated_minutes":30,"goal_uid":"g1",
        "recurrence_type":"weekly","recurrence_interval":1,"recurrence_weekday":1,"completion_based":false
        ${if (extra.isEmpty()) "" else ",$extra"}}""",
    ).jsonObject

    private fun daily() = Json.parseToJsonElement(
        """{"uid":"T","name":"Marcher","status":0,"due_date":"2027-03-26T08:00:00.000Z","due_has_time":true,
        "tag_uids":[],"recurrence_type":"daily","recurrence_interval":1}""",
    ).jsonObject

    private val monday = LocalDate.of(2026, 11, 2)
    private val nextMonday = LocalDate.of(2026, 11, 9)
    private val laterMonday = LocalDate.of(2026, 11, 16)

    private fun edit(
        series: JsonObject,
        scope: RecurringScope,
        occurrence: LocalDate,
        change: OccurrenceChange,
    ) = RecurringEdits.edit(series, scope, occurrence, change, "NEW", zones, today, now)

    private fun RecurringOp.upsert(): RecurringOp.Upsert = this as RecurringOp.Upsert

    private fun Map<String, JsonElement>.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun Map<String, JsonElement>.days(key: String): List<String> =
        (getValue(key) as JsonArray).map { it.jsonPrimitive.content }

    @Test
    fun `this on a later occurrence adds a one-off row and leaves that day out of the series`() {
        val plan = edit(weekly(), RecurringScope.THIS, laterMonday, OccurrenceChange(mapOf("name" to JsonPrimitive("Courses bio"))))

        assertEquals("NEW", plan.editedUid)
        assertEquals(2, plan.ops.size)
        val created = plan.ops[0].upsert()
        assertEquals("NEW", created.uid)
        assertEquals("none", created.fields.text("recurrence_type"))
        assertEquals("Courses bio", created.fields.text("name"))
        assertEquals("lait", created.fields.text("note"))
        assertEquals("p1", created.fields.text("project_uid"))
        assertEquals("30", created.fields.text("estimated_minutes"))
        assertEquals("g1", created.fields.text("goal_uid"))
        assertEquals(listOf("t1", "t2"), created.fields.days("tag_uids"))
        assertEquals("0", created.fields.text("status"))
        assertEquals("2026-11-16T08:00:00Z", created.fields.text("due_date"))
        assertEquals("true", created.fields.text("due_has_time"))
        val series = plan.ops[1].upsert()
        assertEquals("T", series.uid)
        assertEquals(listOf("2026-11-16"), series.fields.days("recurrence_exdates"))
        assertEquals(setOf("recurrence_exdates"), series.fields.keys)
    }

    @Test
    fun `this on a later occurrence keeps the exdates sorted and unique`() {
        val series = weekly("\"recurrence_exdates\":[\"2026-11-23\",\"2026-11-16\"]")
        val plan = edit(series, RecurringScope.THIS, laterMonday, OccurrenceChange())

        assertEquals(listOf("2026-11-16", "2026-11-23"), plan.ops[1].upsert().fields.days("recurrence_exdates"))
    }

    @Test
    fun `this on the current occurrence advances the series to the next one and moves its reminder`() {
        val series = weekly("\"reminder_at\":\"2026-11-02T07:30:00.000Z\"")
        val plan = edit(series, RecurringScope.THIS, monday, OccurrenceChange(mapOf("priority" to JsonPrimitive(2))))

        val created = plan.ops[0].upsert()
        assertEquals("2026-11-02T08:00:00Z", created.fields.text("due_date"))
        assertEquals("2026-11-02T07:30:00Z", created.fields.text("reminder_at"))
        assertEquals("2", created.fields.text("priority"))
        val advanced = plan.ops[1].upsert()
        assertEquals("T", advanced.uid)
        assertEquals("2026-11-09T08:00:00Z", advanced.fields.text("due_date"))
        assertEquals("2026-11-09T07:30:00Z", advanced.fields.text("reminder_at"))
        assertEquals(JsonNull, advanced.fields["reminder_sent_at"])
        assertFalse("recurrence_exdates" in advanced.fields)
    }

    @Test
    fun `this on the current occurrence skips days already left out`() {
        val series = weekly("\"recurrence_exdates\":[\"2026-11-09\"]")
        val plan = edit(series, RecurringScope.THIS, monday, OccurrenceChange())

        assertEquals("2026-11-16T08:00:00Z", plan.ops[1].upsert().fields.text("due_date"))
    }

    @Test
    fun `this on the last occurrence completes the series`() {
        val series = weekly("\"recurrence_end_date\":\"2026-11-08T22:59:59.999Z\"")
        val plan = edit(series, RecurringScope.THIS, monday, OccurrenceChange())

        val closed = plan.ops[1].upsert()
        assertEquals("2", closed.fields.text("status"))
        assertEquals("2026-11-01T10:00:00Z", closed.fields.text("completed_at"))
        assertFalse("due_date" in closed.fields)
    }

    @Test
    fun `following on a later occurrence splits the series in two`() {
        val series = weekly(
            "\"recurrence_end_date\":\"2027-01-31T22:59:59.999Z\",\"recurrence_exdates\":[\"2026-11-09\",\"2026-11-23\",\"2026-12-07\"]",
        )
        val plan = edit(series, RecurringScope.FOLLOWING, laterMonday, OccurrenceChange(mapOf("name" to JsonPrimitive("Courses bio"))))

        assertEquals("NEW", plan.editedUid)
        val created = plan.ops[0].upsert()
        assertEquals("NEW", created.uid)
        assertEquals("weekly", created.fields.text("recurrence_type"))
        assertEquals("1", created.fields.text("recurrence_interval"))
        assertEquals("1", created.fields.text("recurrence_weekday"))
        assertEquals("false", created.fields.text("completion_based"))
        assertEquals("2027-01-31T22:59:59.999Z", created.fields.text("recurrence_end_date"))
        assertEquals(listOf("2026-11-23", "2026-12-07"), created.fields.days("recurrence_exdates"))
        assertEquals("2026-11-16T08:00:00Z", created.fields.text("due_date"))
        assertEquals("Courses bio", created.fields.text("name"))
        val old = plan.ops[1].upsert()
        assertEquals("T", old.uid)
        assertEquals("2026-11-15T22:59:59.999Z", old.fields.text("recurrence_end_date"))
        assertEquals(listOf("2026-11-09"), old.fields.days("recurrence_exdates"))
    }

    @Test
    fun `following on the current occurrence edits the series in place`() {
        val plan = edit(weekly(), RecurringScope.FOLLOWING, monday, OccurrenceChange(mapOf("name" to JsonPrimitive("Courses bio"))))

        assertEquals("T", plan.editedUid)
        assertEquals(1, plan.ops.size)
        val series = plan.ops[0].upsert()
        assertEquals("T", series.uid)
        assertEquals(mapOf<String, JsonElement>("name" to JsonPrimitive("Courses bio")), series.fields)
    }

    @Test
    fun `all edits the series row whatever occurrence was touched`() {
        val plan = edit(weekly(), RecurringScope.ALL, laterMonday, OccurrenceChange(mapOf("priority" to JsonPrimitive(2))))

        assertEquals("T", plan.editedUid)
        assertEquals(1, plan.ops.size)
        assertEquals(mapOf<String, JsonElement>("priority" to JsonPrimitive(2)), plan.ops[0].upsert().fields)
    }

    @Test
    fun `all with a new time writes it on the series current day`() {
        val plan = edit(weekly(), RecurringScope.ALL, laterMonday, OccurrenceChange(time = "10:30"))

        val series = plan.ops[0].upsert()
        assertEquals("2026-11-02T09:30:00Z", series.fields.text("due_date"))
        assertEquals("true", series.fields.text("due_has_time"))
    }

    @Test
    fun `a time change on following keeps the wall clock across the spring switch`() {
        // Paris passe à l'heure d'été dans la nuit du 27 au 28 mars 2027 : 09:00 reste 09:00, soit 07:00Z.
        val plan = edit(daily(), RecurringScope.FOLLOWING, LocalDate.of(2027, 3, 29), OccurrenceChange(time = "11:15"))

        val created = plan.ops[0].upsert()
        assertEquals("2027-03-29T09:15:00Z", created.fields.text("due_date"))
        val kept = edit(daily(), RecurringScope.FOLLOWING, LocalDate.of(2027, 3, 29), OccurrenceChange(mapOf("name" to JsonPrimitive("x"))))
        assertEquals("2027-03-29T07:00:00Z", kept.ops[0].upsert().fields.text("due_date"))
    }

    @Test
    fun `a whole-day series keeps the usual whole-day instant on the new row`() {
        val series = Json.parseToJsonElement(
            """{"uid":"T","name":"Poubelles","status":0,"due_date":"2026-11-02T22:59:59.999Z","due_has_time":false,
            "tag_uids":[],"recurrence_type":"daily","recurrence_interval":1}""",
        ).jsonObject
        val plan = edit(series, RecurringScope.THIS, LocalDate.of(2026, 11, 5), OccurrenceChange(time = "08:00"))

        val created = plan.ops[0].upsert()
        assertEquals("2026-11-05T07:00:00Z", created.fields.text("due_date"))
        assertEquals("true", created.fields.text("due_has_time"))
        val plain = edit(series, RecurringScope.THIS, LocalDate.of(2026, 11, 5), OccurrenceChange())
        assertEquals("2026-11-05T22:59:59.999Z", plain.ops[0].upsert().fields.text("due_date"))
        assertEquals("false", plain.ops[0].upsert().fields.text("due_has_time"))
    }

    @Test
    fun `a reminder on a later occurrence keeps its distance in whole local days across the switch`() {
        val series = Json.parseToJsonElement(
            """{"uid":"T","name":"Marcher","status":0,"due_date":"2027-03-26T08:00:00.000Z","due_has_time":true,
            "reminder_at":"2027-03-26T07:30:00.000Z","tag_uids":[],"recurrence_type":"daily","recurrence_interval":1}""",
        ).jsonObject
        val plan = edit(series, RecurringScope.THIS, LocalDate.of(2027, 3, 29), OccurrenceChange())

        assertEquals("2027-03-29T06:30:00Z", plan.ops[0].upsert().fields.text("reminder_at"))
    }

    @Test
    fun `moving the day of a single occurrence puts the new row on that day`() {
        val plan = edit(weekly(), RecurringScope.THIS, laterMonday, OccurrenceChange(day = LocalDate.of(2026, 11, 18), time = "14:00"))

        val created = plan.ops[0].upsert()
        assertEquals("2026-11-18T13:00:00Z", created.fields.text("due_date"))
        assertEquals(listOf("2026-11-16"), plan.ops[1].upsert().fields.days("recurrence_exdates"))
    }

    @Test
    fun `moving following occurrences by a day shifts the weekday of the new series`() {
        val plan = edit(weekly(), RecurringScope.FOLLOWING, laterMonday, OccurrenceChange(day = LocalDate.of(2026, 11, 17)))

        val created = plan.ops[0].upsert()
        assertEquals("2", created.fields.text("recurrence_weekday"))
        assertEquals("2026-11-17T08:00:00Z", created.fields.text("due_date"))
        assertEquals("2026-11-15T22:59:59.999Z", plan.ops[1].upsert().fields.text("recurrence_end_date"))
    }

    @Test
    fun `moving the whole series shifts its due day, weekday, end date and left-out days`() {
        val series = weekly("\"recurrence_end_date\":\"2027-01-31T22:59:59.999Z\",\"recurrence_exdates\":[\"2026-11-23\"]")
        val plan = edit(series, RecurringScope.ALL, monday, OccurrenceChange(day = LocalDate.of(2026, 11, 3)))

        val moved = plan.ops[0].upsert()
        assertEquals("2026-11-03T08:00:00Z", moved.fields.text("due_date"))
        assertEquals("2", moved.fields.text("recurrence_weekday"))
        assertEquals("2027-02-01T22:59:59.999Z", moved.fields.text("recurrence_end_date"))
        assertEquals(listOf("2026-11-24"), moved.fields.days("recurrence_exdates"))
    }

    @Test
    fun `moving a monthly series follows the new day of the month`() {
        val series = Json.parseToJsonElement(
            """{"uid":"T","name":"Loyer","status":0,"due_date":"2026-11-05T08:00:00.000Z","due_has_time":true,
            "tag_uids":[],"recurrence_type":"monthly","recurrence_interval":1,"recurrence_month_day":5}""",
        ).jsonObject
        val plan = edit(series, RecurringScope.ALL, LocalDate.of(2026, 11, 5), OccurrenceChange(day = LocalDate.of(2026, 11, 8)))

        assertEquals("8", plan.ops[0].upsert().fields.text("recurrence_month_day"))
    }

    @Test
    fun `an occurrence before the current one is refused`() {
        assertThrows(IllegalArgumentException::class.java) {
            edit(weekly(), RecurringScope.THIS, LocalDate.of(2026, 10, 26), OccurrenceChange())
        }
    }

    @Test
    fun `an unsupported repeat rule cannot be split but can be edited as a whole`() {
        val series = Json.parseToJsonElement(
            """{"uid":"T","name":"X","status":0,"due_date":"2026-11-02T08:00:00.000Z","due_has_time":true,
            "tag_uids":[],"recurrence_type":"yearly","recurrence_interval":1}""",
        ).jsonObject

        assertThrows(IllegalStateException::class.java) {
            edit(series, RecurringScope.THIS, LocalDate.of(2027, 11, 2), OccurrenceChange())
        }
        assertEquals(1, edit(series, RecurringScope.ALL, LocalDate.of(2027, 11, 2), OccurrenceChange()).ops.size)
    }

    @Test
    fun `deleting this occurrence skips it when it is the current one`() {
        val plan = RecurringEdits.delete(weekly(), RecurringScope.THIS, monday, zones)

        assertEquals(listOf<RecurringOp>(RecurringOp.Skip("T", "2026-11-02T08:00:00.000Z")), plan.ops)
    }

    @Test
    fun `deleting this occurrence leaves a later day out of the series`() {
        val plan = RecurringEdits.delete(weekly("\"recurrence_exdates\":[\"2026-11-09\"]"), RecurringScope.THIS, laterMonday, zones)

        val series = plan.ops.single().upsert()
        assertEquals("T", series.uid)
        assertEquals(listOf("2026-11-09", "2026-11-16"), series.fields.days("recurrence_exdates"))
    }

    @Test
    fun `deleting following occurrences ends the series the day before`() {
        val series = weekly("\"recurrence_exdates\":[\"2026-11-09\",\"2026-11-23\"]")
        val plan = RecurringEdits.delete(series, RecurringScope.FOLLOWING, laterMonday, zones)

        val ended = plan.ops.single().upsert()
        assertEquals("2026-11-15T22:59:59.999Z", ended.fields.text("recurrence_end_date"))
        assertEquals(listOf("2026-11-09"), ended.fields.days("recurrence_exdates"))
    }

    @Test
    fun `deleting following from the current occurrence or all deletes the series`() {
        assertEquals(listOf<RecurringOp>(RecurringOp.Delete("T")), RecurringEdits.delete(weekly(), RecurringScope.FOLLOWING, monday, zones).ops)
        assertEquals(listOf<RecurringOp>(RecurringOp.Delete("T")), RecurringEdits.delete(weekly(), RecurringScope.ALL, nextMonday, zones).ops)
    }

    @Test
    fun `the end date written for following is read back as the day before`() {
        val plan = RecurringEdits.delete(weekly(), RecurringScope.FOLLOWING, laterMonday, zones)
        val end = plan.ops.single().upsert().fields.text("recurrence_end_date")!!
        val rule = TaskExtras.recurrenceRule("""{"recurrence_end_date":"$end"}""", paris)

        assertEquals(LocalDate.of(2026, 11, 15), rule.endDay)
        assertNull(TaskExtras.recurrenceRule("{}", paris).endDay)
        assertTrue(rule.endDay!!.isBefore(laterMonday))
    }
}
