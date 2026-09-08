package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class HabitStatisticsSummaryTest {
    private val today = LocalDate.of(2026, 9, 8)
    private fun habit(goal: HabitGoal = HabitGoal(10, PeriodType.DAY, minimumMinor = 5)) =
        HabitDefinition("h", startsOn = today.minusDays(100), goal = goal, schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY))
    private fun entry(back: Long, amount: Long) = HabitEntry("e-$back", "h",
        today.minusDays(back).atStartOfDay().toInstant(ZoneOffset.UTC), today.minusDays(back), ZoneOffset.UTC, amount)

    @Test fun `daily summary separates minimum and ideal and ignores current day`() {
        val summary = HabitStatisticsSummary.compute({ habit() }, today, listOf(entry(1, 5), entry(2, 10), entry(0, 10)), emptyList())
        assertEquals(30, summary.evaluatedPeriods)
        assertEquals(2, summary.validatedPeriods)
        assertEquals(1, summary.idealPeriods)
        assertEquals(7, summary.successRatePercent)
        assertEquals(7, summary.trendPercentagePoints)
        assertEquals(today.minusDays(30), summary.from)
        assertEquals(HabitStatisticsDayStatus.MINIMUM, summary.days.last().status)
        assertEquals(HabitStatisticsDayStatus.IDEAL, summary.days[28].status)
    }

    @Test fun `closed limits reward staying below and historical goal is preserved`() {
        val changed = today.minusDays(10)
        val summary = HabitStatisticsSummary.compute({ day ->
            habit(HabitGoal(if (day < changed) 2 else 1, PeriodType.DAY, direction = GoalDirection.AT_MOST))
        }, today, listOf(entry(15, 2), entry(1, 2)), emptyList())
        assertEquals(29, summary.validatedPeriods)
        assertEquals(29, summary.idealPeriods)
        assertEquals(HabitStatisticsDayStatus.MISSED, summary.days.last().status)
    }

    @Test fun `pauses and nonplanned days excluded rather than missed`() {
        val active = habit().copy(startsOn = today.minusDays(3))
        val summary = HabitStatisticsSummary.compute({ active }, today, emptyList(),
            listOf(HabitPause(today.minusDays(1), today)))
        assertEquals(2, summary.evaluatedPeriods)
        assertNull(summary.trendPercentagePoints)
        assertEquals(HabitStatisticsDayStatus.PAUSED, summary.days.last().status)
        assertEquals(HabitStatisticsDayStatus.UNPLANNED, summary.days.first().status)
    }

    @Test fun `weekly and monthly goals count periods not daily missed goals`() {
        val weekly = habit(HabitGoal(1, PeriodType.WEEK)).copy(startsOn = today.minusDays(29))
        val summary = HabitStatisticsSummary.compute({ weekly }, today, listOf(entry(1, 1)), emptyList())
        assertEquals(4, summary.evaluatedPeriods)
        assertEquals(0, summary.validatedPeriods)
        assertEquals(HabitStatisticsDayStatus.ACTIVITY, summary.days.last().status)
        assertEquals(HabitStatisticsDayStatus.NO_ACTIVITY, summary.days[28].status)
        val monthly = HabitStatisticsSummary.compute({ habit(HabitGoal(1, PeriodType.MONTH)) }, today, emptyList(), emptyList())
        assertEquals(1, monthly.evaluatedPeriods)
        assertEquals(1, monthly.previousEvaluatedPeriods)
    }

    @Test fun `abstinence and missing history yield no misleading rate`() {
        val abstinence = habit(HabitGoal(0, PeriodType.DAY, direction = GoalDirection.AT_MOST))
        val summary = HabitStatisticsSummary.compute({ abstinence }, today, emptyList(), emptyList())
        assertEquals(0, summary.evaluatedPeriods)
        assertNull(summary.successRatePercent)
        assertNull(summary.trendPercentagePoints)
        assertEquals(0, HabitStatisticsSummary.compute({ null }, today, emptyList(), emptyList()).evaluatedPeriods)
    }

}
