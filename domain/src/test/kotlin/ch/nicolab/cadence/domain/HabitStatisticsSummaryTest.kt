package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class HabitStatisticsSummaryTest {
    @Test fun `overview follows completed weeks and months rather than daily activity`() {
        val weekly = habit(HabitGoal(1, PeriodType.WEEK)).copy(startsOn = today.minusDays(29))
        val summary = HabitStatisticsSummary.compute({ weekly }, today, listOf(entry(4, 1), entry(0, 1)), emptyList())
        assertEquals(4, summary.periods.size)
        assertTrue(summary.periods.all { it.periodType == PeriodType.WEEK && it.endExclusive <= today })
        assertEquals(HabitStatisticsDayStatus.IDEAL, summary.periods.last().status)
        val monthly = HabitStatisticsSummary.compute({ habit(HabitGoal(1, PeriodType.MONTH)) }, today, emptyList(), emptyList())
        assertEquals(1, monthly.periods.size)
        assertEquals(PeriodType.MONTH, monthly.periods.single().periodType)
    }

    @Test fun `fully paused week is neutral in overview`() {
        val weekly = habit(HabitGoal(1, PeriodType.WEEK))
        val end = PeriodCalculator.window(today, PeriodType.WEEK).start
        val summary = HabitStatisticsSummary.compute({ weekly }, today, emptyList(), listOf(HabitPause(end.minusWeeks(1), end)))
        assertEquals(HabitStatisticsDayStatus.PAUSED, summary.periods.last().status)
        assertEquals(summary.periods.count { it.status == HabitStatisticsDayStatus.MISSED }, summary.evaluatedPeriods)
    }
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

    @Test fun `calendar days cover 365 days up to today`() {
        val summary = HabitStatisticsSummary.compute({ habit() }, today, listOf(entry(1, 5), entry(2, 10), entry(0, 10)), emptyList())
        assertTrue(summary.calendarDays.size >= 365)
        assertEquals(today, summary.calendarDays.last().date)
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

    @Test fun `comparison requires both windows to have sufficient evaluated sample`() {
        val habitStartedRecently = habit().copy(startsOn = today.minusDays(10))
        val summaryRecent = HabitStatisticsSummary.compute({ habitStartedRecently }, today, emptyList(), emptyList())
        assertEquals(10, summaryRecent.evaluatedPeriods)
        assertEquals(0, summaryRecent.previousEvaluatedPeriods)
        assertNull(summaryRecent.comparison)
        assertNull(summaryRecent.trendPercentagePoints)

        // Current has 30 days, previous has only 5 days (< 7 threshold)
        val habitStarted35DaysAgo = habit().copy(startsOn = today.minusDays(35))
        val summary35 = HabitStatisticsSummary.compute({ habitStarted35DaysAgo }, today, emptyList(), emptyList())
        assertEquals(30, summary35.evaluatedPeriods)
        assertEquals(5, summary35.previousEvaluatedPeriods)
        assertNull(summary35.comparison)
        assertNull(summary35.trendPercentagePoints)
    }

    @Test fun `broken homogeneity suppresses comparison`() {
        // Changed period type from DAY to WEEK 35 days ago (previous had DAY, current has WEEK)
        val boundary = today.minusDays(35)
        val changedHabit: (LocalDate) -> HabitDefinition? = { date ->
            if (date < boundary) habit(HabitGoal(10, PeriodType.DAY))
            else habit(HabitGoal(1, PeriodType.WEEK))
        }
        val summary = HabitStatisticsSummary.compute(changedHabit, today, emptyList(), emptyList())
        assertFalse(summary.isHomogeneous)
        assertNull(summary.comparison)
        assertNull(summary.trendPercentagePoints)
    }

    @Test fun `neutral pauses affect completeness and sample without counting as missed`() {
        // 25 paused days in 30-day window leaves 5 evaluated days
        val pauses = listOf(HabitPause(today.minusDays(25), today))
        val summary = HabitStatisticsSummary.compute({ habit() }, today, emptyList(), pauses)
        assertEquals(30, summary.observablePeriods)
        assertEquals(5, summary.evaluatedPeriods)
        assertEquals(StatisticsConfidence.INSUFFICIENT, summary.completeness.confidence)
        assertEquals(StatisticsConfidence.INSUFFICIENT, summary.confidence)
        assertNull(summary.comparison)

        // 10 paused days leaves 20 evaluated days -> LIMITED confidence
        val pauses10 = listOf(HabitPause(today.minusDays(10), today))
        val summary10 = HabitStatisticsSummary.compute({ habit() }, today, emptyList(), pauses10)
        assertEquals(20, summary10.evaluatedPeriods)
        assertEquals(StatisticsConfidence.LIMITED, summary10.confidence)

        // 0 pauses -> 30 evaluated days -> ESTABLISHED confidence
        val summaryFull = HabitStatisticsSummary.compute({ habit() }, today, emptyList(), emptyList())
        assertEquals(30, summaryFull.evaluatedPeriods)
        assertEquals(StatisticsConfidence.ESTABLISHED, summaryFull.confidence)
    }

    @Test fun `weekly and monthly comparisons succeed with sufficient sample`() {
        // Weekly: 60 days history, 4 weeks in previous and 5 weeks in current
        val weekly = habit(HabitGoal(1, PeriodType.WEEK))
        // entries in previous 4 weeks (100% success), none in current 5 weeks (0% success)
        val entries = listOf(entry(37, 1), entry(44, 1), entry(51, 1), entry(58, 1))
        val weeklySummary = HabitStatisticsSummary.compute({ weekly }, today, entries, emptyList())
        assertTrue(weeklySummary.isHomogeneous)
        assertNotNull(weeklySummary.comparison)
        val compWeek = weeklySummary.comparison!!
        assertEquals(0, compWeek.currentRatePercent)
        assertEquals(100, compWeek.previousRatePercent)
        assertEquals(-100, compWeek.deltaPercentagePoints)
        assertEquals(StatisticsTrend.DECLINING, compWeek.trend)

        // Monthly: 60 days history, 1 month in previous (validated) and 1 month in current (validated)
        val monthly = habit(HabitGoal(1, PeriodType.MONTH))
        val monthlyEntries = listOf(entry(15, 1), entry(45, 1))
        val monthlySummary = HabitStatisticsSummary.compute({ monthly }, today, monthlyEntries, emptyList())
        assertTrue(monthlySummary.isHomogeneous)
        assertNotNull(monthlySummary.comparison)
        val compMonth = monthlySummary.comparison!!
        assertEquals(100, compMonth.currentRatePercent)
        assertEquals(100, compMonth.previousRatePercent)
        assertEquals(0, compMonth.deltaPercentagePoints)
        assertEquals(StatisticsTrend.STABLE, compMonth.trend)
    }

    @Test fun `trend detects improvement decline and stability`() {
        // Daily improvement: previous has 0 validated (0%), current has 15 validated (50%)
        val entriesUp = (1..15).map { entry(it.toLong(), 10) }
        val summaryUp = HabitStatisticsSummary.compute({ habit() }, today, entriesUp, emptyList())
        val compUp = summaryUp.comparison
        assertNotNull(compUp)
        assertEquals(StatisticsTrend.IMPROVING, compUp!!.trend)
        assertEquals(50, compUp.deltaPercentagePoints)

        // Daily decline: previous has 30 validated (100%), current has 0 validated (0%)
        val entriesDown = (31..60).map { entry(it.toLong(), 10) }
        val summaryDown = HabitStatisticsSummary.compute({ habit() }, today, entriesDown, emptyList())
        val compDown = summaryDown.comparison
        assertNotNull(compDown)
        assertEquals(StatisticsTrend.DECLINING, compDown!!.trend)
        assertEquals(-100, compDown.deltaPercentagePoints)

        // Daily stable: previous has 15 validated (50%), current has 15 validated (50%)
        val entriesStable = (1..15).map { entry(it.toLong(), 10) } + (31..45).map { entry(it.toLong(), 10) }
        val summaryStable = HabitStatisticsSummary.compute({ habit() }, today, entriesStable, emptyList())
        val compStable = summaryStable.comparison
        assertNotNull(compStable)
        assertEquals(StatisticsTrend.STABLE, compStable!!.trend)
        assertEquals(0, compStable.deltaPercentagePoints)
    }

    @Test fun `confidence thresholds for daily weekly and monthly`() {
        assertEquals(StatisticsConfidence.INSUFFICIENT, HabitStatisticsSummary.confidenceFor(PeriodType.DAY, 0))
        assertEquals(StatisticsConfidence.INSUFFICIENT, HabitStatisticsSummary.confidenceFor(PeriodType.DAY, 6))
        assertEquals(StatisticsConfidence.LIMITED, HabitStatisticsSummary.confidenceFor(PeriodType.DAY, 7))
        assertEquals(StatisticsConfidence.LIMITED, HabitStatisticsSummary.confidenceFor(PeriodType.DAY, 20))
        assertEquals(StatisticsConfidence.ESTABLISHED, HabitStatisticsSummary.confidenceFor(PeriodType.DAY, 21))
        assertEquals(StatisticsConfidence.ESTABLISHED, HabitStatisticsSummary.confidenceFor(PeriodType.DAY, 30))

        assertEquals(StatisticsConfidence.INSUFFICIENT, HabitStatisticsSummary.confidenceFor(PeriodType.WEEK, 1))
        assertEquals(StatisticsConfidence.LIMITED, HabitStatisticsSummary.confidenceFor(PeriodType.WEEK, 2))
        assertEquals(StatisticsConfidence.LIMITED, HabitStatisticsSummary.confidenceFor(PeriodType.WEEK, 3))
        assertEquals(StatisticsConfidence.ESTABLISHED, HabitStatisticsSummary.confidenceFor(PeriodType.WEEK, 4))

        assertEquals(StatisticsConfidence.INSUFFICIENT, HabitStatisticsSummary.confidenceFor(PeriodType.MONTH, 0))
        assertEquals(StatisticsConfidence.LIMITED, HabitStatisticsSummary.confidenceFor(PeriodType.MONTH, 1))
    }
}
