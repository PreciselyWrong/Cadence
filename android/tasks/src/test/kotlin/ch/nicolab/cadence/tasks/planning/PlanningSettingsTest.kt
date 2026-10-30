package ch.nicolab.cadence.tasks.planning

import java.time.DayOfWeek
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PlanningSettingsTest {
    @Test
    fun `time and days round-trip`() {
        val time = LocalTime.of(7, 5)
        assertEquals(time, PlanningSettingsCodec.decodeTime(PlanningSettingsCodec.encodeTime(time), LocalTime.NOON))
        val days = setOf(DayOfWeek.MONDAY, DayOfWeek.SATURDAY)
        assertEquals(days, PlanningSettingsCodec.decodeDays(PlanningSettingsCodec.encodeDays(days), emptySet()))
    }

    @Test
    fun `unreadable values fall back to the default`() {
        assertEquals(LocalTime.NOON, PlanningSettingsCodec.decodeTime("nope", LocalTime.NOON))
        assertEquals(LocalTime.NOON, PlanningSettingsCodec.decodeTime(null, LocalTime.NOON))
        assertEquals(WorkingHours.DEFAULT_DAYS, PlanningSettingsCodec.decodeDays(null, WorkingHours.DEFAULT_DAYS))
        assertEquals(setOf(DayOfWeek.MONDAY), PlanningSettingsCodec.decodeDays("1,x,9", emptySet()))
    }

    @Test
    fun `focus blocks round-trip and sanitise separators in labels`() {
        val blocks = listOf(
            FocusBlock("Travail | de fond; matin", LocalTime.of(9, 0), LocalTime.of(11, 0), setOf(DayOfWeek.TUESDAY)),
            FocusBlock("Déjeuner", LocalTime.of(12, 0), LocalTime.of(13, 30)),
        )
        val decoded = PlanningSettingsCodec.decodeFocus(PlanningSettingsCodec.encodeFocus(blocks))
        assertEquals(2, decoded.size)
        assertEquals("Travail   de fond  matin", decoded[0].label)
        assertEquals(LocalTime.of(13, 30), decoded[1].end)
        assertEquals(setOf(DayOfWeek.TUESDAY), decoded[0].days)
    }

    @Test
    fun `broken or inverted focus blocks are dropped`() {
        assertTrue(PlanningSettingsCodec.decodeFocus("garbage").isEmpty())
        assertTrue(PlanningSettingsCodec.decodeFocus("x|11:00|09:00|1").isEmpty())
        assertTrue(PlanningSettingsCodec.decodeFocus("").isEmpty())
    }
}
