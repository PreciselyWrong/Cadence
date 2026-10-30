package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ReminderSchedulerTest {
    @Test
    fun `next trigger respects selected weekdays and local time`() {
        val reminder = HabitReminderEntity("r", "h", "18:30", "MONDAY,WEDNESDAY", true, true)
        val now = ZonedDateTime.of(2026, 8, 13, 20, 0, 0, 0, ZoneId.of("Europe/Zurich"))

        val next = ReminderScheduler.nextTrigger(reminder, now)

        assertEquals("2026-08-17T18:30+02:00[Europe/Zurich]", next.toString())
    }
}
