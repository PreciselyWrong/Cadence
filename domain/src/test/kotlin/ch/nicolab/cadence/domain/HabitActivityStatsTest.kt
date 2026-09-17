package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HabitActivityStatsTest {
    private val today = LocalDate.of(2026, 9, 17)

    private fun entry(back: Long, value: Long, id: String, habitId: String = "h") = HabitEntry(
        id = id,
        habitId = habitId,
        occurredAt = today.minusDays(back).atStartOfDay().toInstant(ZoneOffset.UTC),
        localDate = today.minusDays(back),
        observedZoneId = ZoneOffset.UTC,
        valueMinor = value,
    )

    @Test fun `activity counts logs independently of target success including today`() {
        val result = HabitActivityStats.compute(
            habitId = "h",
            startsOn = today.minusDays(60),
            today = today,
            entries = listOf(
                entry(0, 2, "a"), entry(0, 3, "b"), entry(5, 4, "c"),
                entry(29, 1, "d"), entry(30, 10, "old"), entry(0, 99, "other", "other"),
            ),
        )

        assertEquals(4, result.entries30)
        assertEquals(3, result.activeDays30)
        assertEquals(10L, result.totalMinor30)
        assertEquals(5L, result.peakDayMinor30)
        assertEquals(10.0 / 3, result.averagePerActiveDayMinor30!!, 0.000001)
        assertEquals(5, result.entries90)
        assertEquals(4, result.activeDays90)
        assertEquals(20L, result.totalMinor90)
        assertEquals(30, result.calendarDays30)
        assertEquals(61, result.calendarDays90)
    }

    @Test fun `start date and empty history limit activity window`() {
        val result = HabitActivityStats.compute(
            habitId = "h",
            startsOn = today.minusDays(2),
            today = today,
            entries = listOf(entry(3, 8, "before")),
        )
        assertEquals(0, result.entries30)
        assertEquals(0, result.activeDays30)
        assertEquals(0L, result.totalMinor30)
        assertEquals(0L, result.peakDayMinor30)
        assertEquals(null, result.averagePerActiveDayMinor30)
        assertEquals(3, result.calendarDays30)
        assertEquals(3, result.calendarDays90)
    }
}
