package ch.nicolab.cadence.widget

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
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
    fun `abstinence shows a neutral label including after an occurrence`() {
        assertEquals("Suivi", WidgetHabitPresentation.value(abstinence, 0, 0, null, "Suivi"))
        assertEquals("Suivi", WidgetHabitPresentation.value(abstinence, 1, 0, null, "Suivi"))
    }

    @Test
    fun `a stale timer cannot replace abstinence tracking`() {
        assertEquals("Suivi", WidgetHabitPresentation.value(abstinence, 0, 0, 120L, "Suivi"))
    }

    @Test
    fun `ordinary habits keep their progression`() {
        val goal = HabitGoal(4, PeriodType.DAY, GoalType.COUNT)
        assertEquals(0.5f, WidgetHabitPresentation.progress(goal, 2, 4))
        assertEquals("2/4", WidgetHabitPresentation.value(goal, 2, 4, null, "Suivi"))
    }
}
