package ch.nicolab.cadence

import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalProgression
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitInsights
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ProgressionCadence
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.UnitDimension
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

class HabitEditorPreservationTest {
    @Test
    fun `editing binary preserves its existing target frequency and quick values`() {
        val existing = card(
            PersistedHabit(
                id = "binary", name = "Traitement", active = true,
                goal = HabitGoal(3, PeriodType.WEEK, GoalType.BINARY, frequencyTarget = 3),
                schedule = HabitSchedule(ScheduleMode.EVERY_DAY),
            ),
            quickValues = listOf(1L),
        )

        val result = success(validateAndBuildHabit(initialHabitDraft(existing), existing))

        assertEquals(3L, result.habit.goal.targetMinor)
        assertEquals(3, result.habit.goal.frequencyTarget)
        assertEquals(listOf(1L), result.quickValues)
    }

    @Test
    fun `limit keeps its progression while stripping incompatible minimum and frequency`() {
        val result = success(validateAndBuildHabit(
            HabitDraft(
                name = "Café", goalType = GoalType.COUNT, target = "2", limited = true,
                minimum = "1", frequencyTarget = "2", progressive = true, progressionStep = "1",
            ),
            null,
        ))

        assertEquals(GoalDirection.AT_MOST, result.habit.goal.direction)
        assertEquals(1L, result.habit.goal.progression?.step)
        assertEquals(null, result.habit.goal.minimumMinor)
        assertEquals(null, result.habit.goal.frequencyTarget)
    }

    @Test
    fun `interval requires a representable value of at least two days`() {
        listOf("", "2147483648").forEach { interval ->
            val result = validateAndBuildHabit(
                HabitDraft(name = "Arrosage", scheduleMode = ScheduleMode.INTERVAL_DAYS, intervalDays = interval),
                null,
            )
            assertEquals(R.string.form_error_interval_days, (result as HabitValidationResult.Error).messageResId)
        }
    }

    @Test
    fun `fractional values round trip exactly through the canonical scale`() {
        val result = success(validateAndBuildHabit(
            HabitDraft(
                name = "Respiration", goalType = GoalType.DURATION, unit = MeasurementUnit.MINUTES,
                target = "1.5", minimum = "0.5", quickValues = "0.5, 1.5",
            ),
            null,
        ))

        assertEquals(90L, result.habit.goal.targetMinor)
        assertEquals(30L, result.habit.goal.minimumMinor)
        assertEquals(listOf(30L, 90L), result.quickValues)
        assertEquals("1.5", formatMinorForDraft(90, MeasurementUnit.MINUTES.scaleToCanonical))
    }

    @Test
    fun `invalid quick values and a cap below the base target are rejected`() {
        val quick = validateAndBuildHabit(
            HabitDraft(name = "Course", goalType = GoalType.QUANTITY, quickValues = "1, nope"),
            null,
        )
        assertEquals(R.string.form_error_quick_values, (quick as HabitValidationResult.Error).messageResId)

        val cap = validateAndBuildHabit(
            HabitDraft(
                name = "Pompes", goalType = GoalType.COUNT, target = "10", progressive = true,
                progressionStep = "1", progressionCap = "9",
            ),
            null,
        )
        assertEquals(R.string.form_error_progression_cap_below_target, (cap as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `editing a custom unit keeps its stable identity`() {
        val unit = MeasurementUnit("custom-stable", UnitDimension.CUSTOM, "Tasses", "tasses", 10L)
        val existing = card(PersistedHabit(
            id = "tea", name = "Thé", active = true,
            goal = HabitGoal(15, PeriodType.DAY, GoalType.COUNT, unit),
            schedule = HabitSchedule(ScheduleMode.EVERY_DAY),
        ))

        val draft = initialHabitDraft(existing)
        val result = success(validateAndBuildHabit(draft, existing))

        assertEquals("1.5", draft.target)
        assertEquals(unit.id, result.habit.goal.unit?.id)
        assertEquals(10L, result.habit.goal.unit?.scaleToCanonical)
        assertEquals(15L, result.habit.goal.targetMinor)
    }

    @Test
    fun `nonterminating minute values fall back to seconds without rounding`() {
        val existing = card(PersistedHabit(
            id = "timer", name = "Minute", active = true,
            goal = HabitGoal(61L, PeriodType.DAY, GoalType.DURATION, MeasurementUnit.MINUTES),
            schedule = HabitSchedule(ScheduleMode.EVERY_DAY),
        ))

        val draft = initialHabitDraft(existing)
        val result = success(validateAndBuildHabit(draft, existing))

        assertEquals(MeasurementUnit.SECONDS, draft.unit)
        assertEquals("61", draft.target)
        assertEquals(61L, result.habit.goal.targetMinor)
    }

    private fun success(result: HabitValidationResult): HabitValidationResult.Success {
        assertTrue(result is HabitValidationResult.Success)
        return result as HabitValidationResult.Success
    }

    private fun card(habit: PersistedHabit, quickValues: List<Long> = emptyList()): HabitCardState = HabitCardState(
        stored = habit,
        evaluation = HabitEvaluator().evaluate(habit.definition, LocalDate.of(2026, 9, 9), emptyList()),
        quickValues = quickValues,
        reminders = emptyList(),
        history = emptyList(),
        entryCount = 0,
        dailyHistory = emptyList(),
        insights = HabitInsights(),
        recentEntries = emptyList(),
        pauses = emptyList(),
        streak = HabitStreak(0, 0),
    )
}
