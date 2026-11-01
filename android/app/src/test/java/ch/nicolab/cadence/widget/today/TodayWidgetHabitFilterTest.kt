package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitDefinition
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.GoalAttainment
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.PeriodType
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.DayOfWeek
import java.time.LocalDate

class TodayWidgetHabitFilterTest {
    private val goals = mapOf(
        HabitKind.TODO to HabitGoal(1, PeriodType.DAY, GoalType.BINARY),
        HabitKind.QUANTITY to HabitGoal(8, PeriodType.DAY, GoalType.QUANTITY),
        HabitKind.LIMIT to HabitGoal(2, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
        HabitKind.ABSTINENCE to HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
        HabitKind.TRACKER to HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.TRACK_ONLY),
        HabitKind.TIMER to HabitGoal(30, PeriodType.DAY, GoalType.DURATION),
    )

    private fun evaluation(goal: HabitGoal, planned: Boolean = true, completed: Boolean = false): HabitEvaluation {
        val today = LocalDate.of(2026, 11, 1)
        val habit = HabitDefinition("h", true, goal, HabitSchedule())
        return HabitEvaluation(
            habit = habit,
            period = PeriodCalculator.window(today, goal.period, DayOfWeek.MONDAY),
            progressMinor = 0, completedQuantity = completed, reachedMinimum = completed, validatesPeriod = completed,
            attainment = GoalAttainment.TODO, targetMinor = goal.targetMinor, limitStatus = null, sessionCount = 0,
            completedFrequency = completed, isCompleted = completed, isPaused = false, isPlannedForDate = planned,
            needsAttentionNow = !completed, countsAsFailure = false,
        )
    }

    @Test
    fun `chaque objectif tombe dans sa nature`() {
        goals.forEach { (kind, goal) -> assertEquals(kind, goal.widgetKind()) }
    }

    @Test
    fun `par defaut tout est affiche`() {
        goals.values.forEach { assertTrue(showsHabit(it, evaluation(it), TodayWidgetConfig())) }
    }

    @Test
    fun `masquer une nature ne retire que celle-la`() {
        HabitKind.entries.forEach { hidden ->
            val config = TodayWidgetConfig(hiddenHabitKinds = setOf(hidden))
            goals.forEach { (kind, goal) -> assertEquals(kind != hidden, showsHabit(goal, evaluation(goal), config), "$kind avec $hidden masquee") }
        }
    }

    @Test
    fun `seulement les habitudes prevues aujourd'hui`() {
        val goal = goals.getValue(HabitKind.TODO)
        val config = TodayWidgetConfig(onlyPlannedHabits = true)
        assertTrue(showsHabit(goal, evaluation(goal, planned = true), config))
        assertFalse(showsHabit(goal, evaluation(goal, planned = false), config))
        assertTrue(showsHabit(goal, evaluation(goal, planned = false), TodayWidgetConfig()))
    }

    @Test
    fun `masquer les habitudes deja faites`() {
        val goal = goals.getValue(HabitKind.QUANTITY)
        val config = TodayWidgetConfig(hideDoneHabits = true)
        assertFalse(showsHabit(goal, evaluation(goal, completed = true), config))
        assertTrue(showsHabit(goal, evaluation(goal, completed = false), config))
        assertTrue(showsHabit(goal, evaluation(goal, completed = true), TodayWidgetConfig()))
    }
}
