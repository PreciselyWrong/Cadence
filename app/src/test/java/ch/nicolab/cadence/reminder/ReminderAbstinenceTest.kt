package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.PeriodType
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
}
