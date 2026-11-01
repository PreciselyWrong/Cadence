package ch.nicolab.cadence.tasks.reminder

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ReminderAlarmsTest {
    @Test
    fun `avant Android 12 les alarmes exactes ne demandent rien`() {
        assertEquals(ReminderAlarms.Mode.EXACT, ReminderAlarms.mode(sdk = 30, canScheduleExact = false))
    }

    @Test
    fun `depuis Android 12 l'exact suit la permission, sinon une fenêtre`() {
        assertEquals(ReminderAlarms.Mode.EXACT, ReminderAlarms.mode(sdk = 34, canScheduleExact = true))
        assertEquals(ReminderAlarms.Mode.WINDOW, ReminderAlarms.mode(sdk = 34, canScheduleExact = false))
    }

    @Test
    fun `la fenêtre couvre une minute avant et une minute après l'heure`() {
        val trigger = 1_800_000_000_000L

        assertEquals(trigger - 60_000L, ReminderAlarms.windowStart(trigger))
        assertEquals(trigger + 60_000L, ReminderAlarms.windowStart(trigger) + ReminderAlarms.WINDOW_MILLIS)
    }
}
