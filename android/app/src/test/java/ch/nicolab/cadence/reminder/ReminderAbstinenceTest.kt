package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitDefinition
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.PeriodType
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReminderAbstinenceTest {
    @Test
    fun `abstinence refuses entry actions including stale notification actions`() {
        val goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST)
        assertFalse(ReminderNotifications.allowsEntryAction(goal))
    }

    @Test
    fun `ordinary targets and positive limits keep entry actions`() {
        assertTrue(ReminderNotifications.allowsEntryAction(HabitGoal(1, PeriodType.DAY, GoalType.BINARY)))
        assertTrue(ReminderNotifications.allowsEntryAction(HabitGoal(3, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST)))
    }

    @Test
    fun `completed habit dismisses its reminder while partial progress keeps it`() {
        val today = LocalDate.of(2026, 9, 9)
        val habit = HabitDefinition(
            id = "habit",
            goal = HabitGoal(2, PeriodType.DAY, GoalType.COUNT),
            schedule = HabitSchedule(),
        )
        fun entry(id: String) = HabitEntry(id, habit.id, Instant.parse("2026-09-09T08:00:00Z"), today, ZoneId.of("Europe/Zurich"), 1)
        val evaluator = HabitEvaluator()

        assertFalse(ReminderNotifications.shouldCancel(evaluator.evaluate(habit, today, listOf(entry("one")))))
        assertTrue(ReminderNotifications.shouldCancel(evaluator.evaluate(habit, today, listOf(entry("one"), entry("two")))))
    }
}
