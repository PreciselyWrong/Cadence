package ch.nicolab.cadence

import ch.nicolab.cadence.domain.HabitStatisticsPeriod
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.HabitStatisticsDayStatus
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class StatisticsPulseTest {
    @Test
    fun `pulse keeps the latest days and preserves their visual weight`() {
        val days = listOf(
            day(1, HabitStatisticsDayStatus.MISSED),
            day(2, HabitStatisticsDayStatus.PAUSED),
            day(3, HabitStatisticsDayStatus.ACTIVITY),
            day(4, HabitStatisticsDayStatus.MINIMUM),
            day(5, HabitStatisticsDayStatus.IDEAL),
        )

        assertEquals(
            listOf(StatisticsPulseLevel.ACTIVE, StatisticsPulseLevel.ACTIVE, StatisticsPulseLevel.IDEAL),
            days.toStatisticsPulse(maxPeriods = 3),
        )
    }

    @Test
    fun `pulse separates misses from neutral days`() {
        val days = listOf(
            day(1, HabitStatisticsDayStatus.UNPLANNED),
            day(2, HabitStatisticsDayStatus.NO_ACTIVITY),
            day(3, HabitStatisticsDayStatus.MISSED),
        )

        assertEquals(
            listOf(StatisticsPulseLevel.QUIET, StatisticsPulseLevel.QUIET, StatisticsPulseLevel.MISSED),
            days.toStatisticsPulse(),
        )
    }

    private fun day(day: Int, status: HabitStatisticsDayStatus) =
        HabitStatisticsPeriod(LocalDate.of(2026, 9, day), LocalDate.of(2026, 9, day).plusDays(1), PeriodType.DAY, status)
}
