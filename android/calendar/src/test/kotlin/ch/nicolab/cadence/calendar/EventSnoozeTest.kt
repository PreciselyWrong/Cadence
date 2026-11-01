package ch.nicolab.cadence.calendar

import java.time.Duration
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EventSnoozeTest {
    private val now = Instant.parse("2026-11-01T09:00:00Z")
    private val noShift: (Instant) -> Instant = { it }

    @Test
    fun untilEndIsOfferedWhileTheEventHasAtLeastFiveMinutesLeft() {
        assertTrue(EventSnooze.offersUntilEnd(now.plusSeconds(300), now, allDay = false))
        assertTrue(EventSnooze.offersUntilEnd(now.plus(Duration.ofHours(1)), now, allDay = false))
    }

    @Test
    fun untilEndIsHiddenWithLessThanFiveMinutesLeft() {
        assertFalse(EventSnooze.offersUntilEnd(now.plusSeconds(299), now, allDay = false))
        assertFalse(EventSnooze.offersUntilEnd(now, now, allDay = false))
    }

    @Test
    fun untilEndIsHiddenForAllDayEvents() {
        assertFalse(EventSnooze.offersUntilEnd(now.plus(Duration.ofHours(2)), now, allDay = true))
    }

    @Test
    fun tenMinutesWaitsTenMinutesFromNow() {
        assertEquals(now.plus(Duration.ofMinutes(10)), EventSnooze.triggerAt(EventSnoozeMode.TEN_MINUTES, now, now.plus(Duration.ofHours(1)), noShift))
    }

    @Test
    fun untilEndRingsAtTheEventEnd() {
        val end = now.plus(Duration.ofMinutes(45))
        assertEquals(end, EventSnooze.triggerAt(EventSnoozeMode.UNTIL_END, now, end, noShift))
    }

    @Test
    fun quietHoursShiftTheRingingTime() {
        val quietUntil = now.plus(Duration.ofHours(3))
        val shift: (Instant) -> Instant = { quietUntil }
        assertEquals(quietUntil, EventSnooze.triggerAt(EventSnoozeMode.TEN_MINUTES, now, now.plusSeconds(600), shift))
    }
}
