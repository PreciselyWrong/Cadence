package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TrackerModeTest {
    private val today = LocalDate.of(2026, 9, 17)
    private val goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, MeasurementUnit.COUNT,
        direction = GoalDirection.TRACK_ONLY)
    private val habit = HabitDefinition("tracker", startsOn = today.minusDays(10), goal = goal,
        schedule = HabitSchedule(mode = ScheduleMode.SELECTED_DAYS, activeDays = setOf(DayOfWeek.MONDAY)))
    private val entry = HabitEntry("entry", habit.id, today.atStartOfDay().toInstant(ZoneOffset.UTC), today,
        ZoneOffset.UTC, 5)

    @Test fun `a tracker has a measurement but no target or goal options`() {
        assertTrue(goal.isTracker)
        assertFalse(goal.isLimit)
        assertFalse(goal.isAbstinence)
        assertThrows(IllegalArgumentException::class.java) {
            goal.copy(targetMinor = 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            goal.copy(minimumMinor = 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            goal.copy(goalType = GoalType.BINARY)
        }
    }

    @Test fun `logging activity never produces a fictional goal result`() {
        val evaluation = HabitEvaluator().evaluate(habit, today, listOf(entry))
        assertTrue(evaluation.isPlannedForDate)
        assertEquals(5, evaluation.progressMinor)
        assertFalse(evaluation.completedQuantity)
        assertFalse(evaluation.isCompleted)
        assertFalse(evaluation.validatesPeriod)
        assertFalse(evaluation.countsAsFailure)
        assertFalse(evaluation.needsAttentionNow)
        assertEquals(2L, TodayPresentation.directAmount(evaluation, listOf(2)))
        assertTrue(WeekOutlook.of(listOf(habit), today, listOf(entry)) { emptyList() }
            .byStage.values.flatten().isEmpty())
        assertEquals(HabitStreak(0, 0), StreakCalculator.compute({ habit }, today, listOf(entry), emptyList()))
        assertEquals(0, HabitStatisticsSummary.compute({ habit }, today, listOf(entry), emptyList()).evaluatedPeriods)
    }
}
