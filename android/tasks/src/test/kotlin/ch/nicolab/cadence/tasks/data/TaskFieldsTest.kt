package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.RepeatType
import ch.nicolab.cadence.tasks.model.Repetition
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskFieldsTest {
    private val paris = ZoneId.of("Europe/Paris")

    @Test
    fun `extras expose scalars as text and ignore objects`() {
        val extras = TaskExtras.parse(
            """{"start_date":"2026-10-27T00:00:00.000Z","estimated_minutes":90,"start_has_time":false,"nested":{"a":1},"none":null}""",
        )
        assertEquals("2026-10-27T00:00:00.000Z", extras["start_date"])
        assertEquals("90", extras["estimated_minutes"])
        assertEquals("false", extras["start_has_time"])
        assertNull(extras["nested"])
        assertNull(extras["none"])
        assertEquals(emptyMap<String, String>(), TaskExtras.parse("not json"))
    }

    @Test
    fun `start without time is the start of the day in the account zone`() {
        val fields = TaskFields.start(LocalDate.of(2026, 10, 27), null, paris, paris)
        assertEquals("2026-10-26T23:00:00Z", fields.getValue("start_date").jsonPrimitive.content)
        assertEquals("false", fields.getValue("start_has_time").jsonPrimitive.content)
    }

    @Test
    fun `start with time uses the device zone and flags the time`() {
        val fields = TaskFields.start(LocalDate.of(2026, 10, 27), "18:00", paris, paris)
        assertEquals("2026-10-27T17:00:00Z", fields.getValue("start_date").jsonPrimitive.content)
        assertEquals("true", fields.getValue("start_has_time").jsonPrimitive.content)
    }

    @Test
    fun `clearing the start writes nulls`() {
        val fields = TaskFields.start(null, null, paris, paris)
        assertEquals(JsonNull, fields.getValue("start_date"))
        assertEquals("false", fields.getValue("start_has_time").jsonPrimitive.content)
    }

    @Test
    fun `estimate writes minutes or null`() {
        assertEquals(90, TaskFields.estimate(90).getValue("estimated_minutes").jsonPrimitive.int)
        assertEquals(JsonNull, TaskFields.estimate(null).getValue("estimated_minutes"))
    }

    @Test
    fun `no repetition clears the rule`() {
        val fields = TaskFields.repetition(Repetition(RepeatType.NONE, 1), LocalDate.of(2026, 10, 28))
        assertEquals(JsonPrimitive("none"), fields.getValue("recurrence_type"))
        assertEquals(JsonNull, fields.getValue("recurrence_weekday"))
        assertEquals(JsonNull, fields.getValue("recurrence_month_day"))
    }

    @Test
    fun `weekly repetition anchors on the due weekday, sunday being zero`() {
        // 2026-11-01 is a Sunday, 2026-10-28 a Wednesday.
        val sunday = TaskFields.repetition(Repetition(RepeatType.WEEKLY, 2), LocalDate.of(2026, 11, 1))
        assertEquals(0, sunday.getValue("recurrence_weekday").jsonPrimitive.int)
        assertEquals(2, sunday.getValue("recurrence_interval").jsonPrimitive.int)
        val wednesday = TaskFields.repetition(Repetition(RepeatType.WEEKLY, 1), LocalDate.of(2026, 10, 28))
        assertEquals(3, wednesday.getValue("recurrence_weekday").jsonPrimitive.int)
    }

    @Test
    fun `monthly repetition anchors on the due day of month`() {
        val fields = TaskFields.repetition(Repetition(RepeatType.MONTHLY, 1), LocalDate.of(2026, 10, 28))
        assertEquals(28, fields.getValue("recurrence_month_day").jsonPrimitive.int)
    }

    @Test
    fun `interval is clamped to at least one`() {
        val fields = TaskFields.repetition(Repetition(RepeatType.DAILY, 0), null)
        assertEquals(1, fields.getValue("recurrence_interval").jsonPrimitive.int)
    }

    @Test
    fun `repetition read back from wire values`() {
        assertEquals(Repetition(RepeatType.WEEKLY, 2), Repetition.of("weekly", "2"))
        assertEquals(Repetition(RepeatType.NONE, 1), Repetition.of(null, null))
        assertEquals(Repetition(RepeatType.NONE, 1), Repetition.of("none", "3"))
        assertEquals(Repetition(RepeatType.OTHER, 1), Repetition.of("monthly_weekday", null))
    }
}
