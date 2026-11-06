package ch.nicolab.cadence.habits

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.PeriodType
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HabitFillRatioTest {
    private val goal = HabitGoal(targetMinor = 4, period = PeriodType.DAY)

    @Test
    fun `nothing done leaves the card neutral`() {
        assertEquals(0f, habitFillRatio(goal, 0, 4, completed = false, archived = false))
    }

    @Test
    fun `the colour fills with progress`() {
        assertEquals(0.5f, habitFillRatio(goal, 2, 4, completed = false, archived = false))
    }

    @Test
    fun `only a reached goal fills the card`() {
        assertEquals(1f, habitFillRatio(goal, 4, 4, completed = true, archived = false))
        assertEquals(0.95f, habitFillRatio(goal, 4, 4, completed = false, archived = false))
    }

    @Test
    fun `limit, abstinence, tracker and archived habits stay neutral`() {
        val limit = HabitGoal(targetMinor = 2, period = PeriodType.DAY, direction = GoalDirection.AT_MOST)
        val abstinence = HabitGoal(targetMinor = 0, period = PeriodType.DAY, direction = GoalDirection.AT_MOST)
        val tracker = HabitGoal(targetMinor = 0, period = PeriodType.DAY, direction = GoalDirection.TRACK_ONLY)
        listOf(limit, abstinence, tracker).forEach { assertEquals(0f, habitFillRatio(it, 1, 2, completed = false, archived = false)) }
        assertEquals(0f, habitFillRatio(goal, 4, 4, completed = true, archived = true))
    }
}
