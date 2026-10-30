package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AbstinenceStatsTest {
    private val today = LocalDate.of(2026, 9, 8)
    private fun entry(back: Long, id: String = "e", habit: String = "h") = HabitEntry(
        id, habit, today.minusDays(back).atStartOfDay().toInstant(ZoneOffset.UTC),
        today.minusDays(back), ZoneOffset.UTC, 1,
    )
    private fun stats(days: Long = 40, entries: List<HabitEntry> = emptyList(), pauses: List<HabitPause> = emptyList()) =
        AbstinenceStatsCalculator.compute("h", today.minusDays(days), today, entries, pauses)

    @Test fun `only completed civil days count`() {
        val result = stats()
        assertEquals(40L, result.currentDays)
        assertEquals(40L, result.bestDays)
        assertEquals(30, result.observedDays30)
        assertEquals(30, result.clearDays30)
        assertEquals(40, result.observedDays90)
        assertEquals(40, result.clearDays90)
        assertEquals(40, result.observedDays365)
        assertEquals(40, result.clearDays365)
        assertEquals(40, result.observedDaysAllTime)
        assertEquals(40, result.clearDaysAllTime)
        assertEquals(0L, stats(0).currentDays)
        assertEquals(0, stats(-2).observedDays30)
    }
    @Test fun `occurrences group by date and corrections recompute`() {
        val entries = listOf(entry(5), entry(5, "e2"), entry(35), entry(-1), entry(50), entry(1, habit = "other"))
        val result = stats(entries = entries)
        assertEquals(4L, result.currentDays)
        assertEquals(29L, result.bestDays)
        assertEquals(29, result.clearDays30)
        assertEquals(1, result.occurrenceDays30)
        assertEquals(2, result.occurrences30)
        assertEquals(3, result.occurrences90)
        assertEquals(2, result.occurrenceDays90)
        assertEquals(3, result.occurrences365)
        assertEquals(2, result.occurrenceDays365)
        assertEquals(3, result.occurrencesAllTime)
        assertEquals(2, result.occurrenceDaysAllTime)
        assertEquals(40L, stats().currentDays)
    }
    @Test fun `calendar days contain statuses for each date up to 365 days`() {
        val entries = listOf(entry(5), entry(0))
        val pauses = listOf(HabitPause(today.minusDays(12), today.minusDays(10)))
        val result = stats(days = 20, entries = entries, pauses = pauses)
        assertTrue(result.days.size >= 365)
        val dayMinus25 = result.days.first { it.date == today.minusDays(25) }
        assertEquals(AbstinenceStatisticsDayStatus.UNOBSERVED, dayMinus25.status)
        val dayMinus11 = result.days.first { it.date == today.minusDays(11) }
        assertEquals(AbstinenceStatisticsDayStatus.PAUSED, dayMinus11.status)
        val dayMinus5 = result.days.first { it.date == today.minusDays(5) }
        assertEquals(AbstinenceStatisticsDayStatus.OCCURRENCE, dayMinus5.status)
        assertEquals(1, dayMinus5.occurrences)
        val dayMinus2 = result.days.first { it.date == today.minusDays(2) }
        assertEquals(AbstinenceStatisticsDayStatus.CLEAR, dayMinus2.status)
        val dayToday = result.days.first { it.date == today }
        assertEquals(AbstinenceStatisticsDayStatus.TODAY_OCCURRENCE, dayToday.status)
    }
    @Test fun `activity frequency uses distinct occurrence days and completed gaps`() {
        val result = stats(entries = listOf(entry(20), entry(10), entry(10, "second"), entry(3)))
        assertEquals(4, result.occurrences30)
        assertEquals(3, result.occurrenceDays30)
        assertEquals(7.5, result.averageClearDaysBetweenOccurrences)
        assertNull(stats(entries = listOf(entry(3))).averageClearDaysBetweenOccurrences)
    }
    @Test fun `frequency does not bridge a tracking pause`() {
        val result = stats(
            entries = listOf(entry(20), entry(10), entry(3)),
            pauses = listOf(HabitPause(today.minusDays(15), today.minusDays(14))),
        )
        assertEquals(6.0, result.averageClearDaysBetweenOccurrences)
    }
    @Test fun `today occurrence interrupts current but is absent from completed window`() {
        val result = stats(entries = listOf(entry(0)))
        assertEquals(0L, result.currentDays)
        assertEquals(40L, result.bestDays)
        assertEquals(0, result.occurrences30)
        assertTrue(result.todayHasOccurrence)
    }
    @Test fun `overlapping pauses are unobserved and break runs`() {
        val pauses = listOf(HabitPause(today.minusDays(10), today.minusDays(5)), HabitPause(today.minusDays(7), today.minusDays(3)))
        val result = stats(entries = listOf(entry(6)), pauses = pauses)
        assertEquals(3L, result.currentDays)
        assertEquals(30L, result.bestDays)
        assertEquals(23, result.observedDays30)
        assertEquals(23, result.clearDays30)
        assertEquals(0, result.occurrences30)
        val paused = stats(pauses = listOf(HabitPause(today, null)))
        assertTrue(paused.isPaused)
        assertEquals(0L, paused.currentDays)
    }
    @Test fun `very long observation does not enumerate days`() {
        assertEquals(1_000_000L, stats(1_000_000).bestDays)
    }
    @Test fun `zero limit remains available before and after recording`() {
        val goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST)
        assertTrue(goal.isAbstinence)
        val weekly = HabitDefinition("h", goal = goal, schedule = HabitSchedule())
        assertEquals(1, WeekOutlook.of(listOf(weekly), today, emptyList()) { emptyList() }.byStage[WeekStage.WELL_UNDERWAY]!!.size)
        val habit = HabitDefinition("h", goal = goal, schedule = HabitSchedule())
        assertTrue(HabitEvaluator().evaluate(habit, today, emptyList()).needsAttentionNow)
        assertTrue(HabitEvaluator().evaluate(habit, today, listOf(entry(0))).needsAttentionNow)
        assertFalse(HabitEvaluator().evaluate(habit, today, emptyList(), listOf(HabitPause(today, null))).needsAttentionNow)
    }
    @Test fun `zero target forbidden for ordinary goals and progression`() {
        assertThrows(IllegalArgumentException::class.java) { HabitGoal(0, PeriodType.DAY) }
        assertThrows(IllegalArgumentException::class.java) {
            HabitGoal(0, PeriodType.DAY, direction = GoalDirection.AT_MOST,
                progression = GoalProgression(1, ProgressionCadence.WEEKLY, null, today))
        }
    }
}

