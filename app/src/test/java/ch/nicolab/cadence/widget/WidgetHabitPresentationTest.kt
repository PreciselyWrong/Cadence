package ch.nicolab.cadence.widget

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.AbstinenceElapsed
import ch.nicolab.cadence.domain.PeriodType
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class WidgetHabitPresentationTest {
    private val abstinence get() = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST)

    @Test
    fun `an occurrence never fills an abstinence progress ring`() {
        assertEquals(0f, WidgetHabitPresentation.progress(abstinence, 1, 0))
    }

    @Test
    fun `abstinence shows its live elapsed counter including after an occurrence`() {
        val elapsed = AbstinenceElapsed(23, 8, 12, 34)
        assertEquals("23 j 8 h", WidgetHabitPresentation.value(abstinence, 0, 0, null, elapsed))
        assertEquals("23 j 8 h", WidgetHabitPresentation.value(abstinence, 1, 0, null, elapsed))
    }

    @Test
    fun `a stale timer cannot replace abstinence tracking`() {
        assertEquals("8 h 12 min", WidgetHabitPresentation.value(abstinence, 0, 0, 120L, AbstinenceElapsed(0, 8, 12, 0)))
    }

    @Test
    fun `ordinary habits keep their progression`() {
        val goal = HabitGoal(4, PeriodType.DAY, GoalType.COUNT)
        assertEquals(0.5f, WidgetHabitPresentation.progress(goal, 2, 4))
        assertEquals("2/4", WidgetHabitPresentation.value(goal, 2, 4, null, null))
    }
}
