package ch.nicolab.cadence.reminder

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AlcoholFollowUpPlannerTest {
    private val zurich = ZoneId.of("Europe/Zurich")

    @Test
    fun `plans the next morning at the configured time`() {
        val planned = AlcoholFollowUpPlanner.plan(
            consumptionId = "c",
            habitId = "h",
            followUpDate = LocalDate.of(2026, 9, 12),
            standardDrinks = null,
            followUpNotified = false,
            followUpTime = LocalTime.of(9, 0),
            zoneId = zurich,
        )

        assertEquals(Instant.parse("2026-09-12T07:00:00Z"), planned?.triggerAt)
        assertFalse(AlcoholFollowUpPlanner.isDue(planned!!, Instant.parse("2026-09-12T06:59:59Z")))
    }

    @Test
    fun `resolves daylight saving and the selected zone from the local follow up date`() {
        val dst = AlcoholFollowUpPlanner.plan(
            consumptionId = "c", habitId = "h", followUpDate = LocalDate.of(2026, 3, 29),
            standardDrinks = null, followUpNotified = false, followUpTime = LocalTime.of(9, 0), zoneId = zurich,
        )
        val tokyo = AlcoholFollowUpPlanner.plan(
            consumptionId = "c", habitId = "h", followUpDate = LocalDate.of(2026, 9, 12),
            standardDrinks = null, followUpNotified = false, followUpTime = LocalTime.of(9, 0), zoneId = ZoneId.of("Asia/Tokyo"),
        )

        assertEquals(Instant.parse("2026-03-29T07:00:00Z"), dst?.triggerAt)
        assertEquals(Instant.parse("2026-09-12T00:00:00Z"), tokyo?.triggerAt)
    }

    @Test
    fun `overdue follow up is immediately due after process restart`() {
        val planned = AlcoholFollowUpPlanner.plan(
            consumptionId = "c", habitId = "h", followUpDate = LocalDate.of(2026, 9, 12),
            standardDrinks = null, followUpNotified = false, followUpTime = LocalTime.of(9, 0), zoneId = zurich,
        )!!

        assertTrue(AlcoholFollowUpPlanner.isDue(planned, Instant.parse("2026-09-12T07:00:00Z")))
    }

    @Test
    fun `completed or already notified consumption is excluded`() {
        assertNull(AlcoholFollowUpPlanner.plan("c", "h", null, null, false, LocalTime.of(9, 0), zurich))
        assertNull(AlcoholFollowUpPlanner.plan("c", "h", LocalDate.of(2026, 9, 12), 2, false, LocalTime.of(9, 0), zurich))
        assertNull(AlcoholFollowUpPlanner.plan("c", "h", LocalDate.of(2026, 9, 12), null, true, LocalTime.of(9, 0), zurich))
    }
}
