package ch.nicolab.cadence

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ProgressionCadence
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.UnitDimension
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.DayOfWeek

class HabitEditorLogicTest {

    @Test
    fun `validation rejects blank habit name`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "   ",
            target = "1",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Error)
        assertEquals(R.string.form_error_required_name, (result as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation rejects zero or negative target for non-binary goals`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Lecture",
            goalType = GoalType.COUNT,
            target = "0",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Error)
        assertEquals(R.string.form_error_positive_target, (result as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation rejects target multiplication overflow`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Marathon",
            goalType = GoalType.QUANTITY,
            unit = MeasurementUnit.KILOMETERS, // scale 1000
            target = (Long.MAX_VALUE / 500).toString(),
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Error)
        assertEquals(R.string.form_error_positive_target, (result as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation rejects incomplete custom unit`() {
        val draftIncompleteName = HabitDraft(
            id = "test-id",
            name = "Échecs",
            goalType = GoalType.COUNT,
            customUnit = true,
            customName = "  ",
            customSymbol = "p.",
            target = "5",
        )
        val res1 = validateAndBuildHabit(draftIncompleteName, existing = null)
        assertTrue(res1 is HabitValidationResult.Error)
        assertEquals(R.string.form_error_incomplete_unit, (res1 as HabitValidationResult.Error).messageResId)

        val draftIncompleteSymbol = HabitDraft(
            id = "test-id",
            name = "Échecs",
            goalType = GoalType.COUNT,
            customUnit = true,
            customName = "Parties",
            customSymbol = "  ",
            target = "5",
        )
        val res2 = validateAndBuildHabit(draftIncompleteSymbol, existing = null)
        assertTrue(res2 is HabitValidationResult.Error)
        assertEquals(R.string.form_error_incomplete_unit, (res2 as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation accepts complete custom unit and builds habit`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Échecs",
            goalType = GoalType.COUNT,
            customUnit = true,
            customName = "Parties",
            customSymbol = "p.",
            target = "5",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Success)
        val success = result as HabitValidationResult.Success
        assertEquals("Parties", success.habit.goal.unit?.nameFr)
        assertEquals("p.", success.habit.goal.unit?.symbol)
        assertEquals(UnitDimension.CUSTOM, success.habit.goal.unit?.dimension)
        assertEquals(5L, success.habit.goal.targetMinor)
    }

    @Test
    fun `validation rejects minimum that exceeds target or is zero`() {
        val draftExceeding = HabitDraft(
            id = "test-id",
            name = "Course",
            goalType = GoalType.QUANTITY,
            unit = MeasurementUnit.KILOMETERS,
            target = "5",
            minimum = "6",
        )
        val res1 = validateAndBuildHabit(draftExceeding, existing = null)
        assertTrue(res1 is HabitValidationResult.Error)
        assertEquals(R.string.form_error_minimum, (res1 as HabitValidationResult.Error).messageResId)

        val draftZero = HabitDraft(
            id = "test-id",
            name = "Course",
            goalType = GoalType.QUANTITY,
            unit = MeasurementUnit.KILOMETERS,
            target = "5",
            minimum = "0",
        )
        val res2 = validateAndBuildHabit(draftZero, existing = null)
        assertTrue(res2 is HabitValidationResult.Error)
        assertEquals(R.string.form_error_minimum, (res2 as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation rejects non-positive frequency`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Sport",
            goalType = GoalType.DURATION,
            target = "60",
            frequencyTarget = "0",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Error)
        assertEquals(R.string.form_error_positive_frequency, (result as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation rejects selected days mode with no active days`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Méditation",
            scheduleMode = ScheduleMode.SELECTED_DAYS,
            activeDays = emptySet(),
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Error)
        assertEquals(R.string.form_error_no_day, (result as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation rejects interval days less than two`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Arrosage",
            scheduleMode = ScheduleMode.INTERVAL_DAYS,
            intervalDays = "1",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Error)
        assertEquals(R.string.form_error_interval_days, (result as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `validation rejects invalid reminder time format`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Vitamines",
            reminderTimes = "08:00, 25:99",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Error)
        assertEquals(R.string.form_error_time_format, (result as HabitValidationResult.Error).messageResId)
    }

    @Test
    fun `binary goal safely resets target unit limit timer minimum and progression`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Médicament",
            goalType = GoalType.BINARY,
            target = "999",
            unit = MeasurementUnit.HOURS,
            limited = true,
            timerEnabled = true,
            minimum = "50",
            progressive = true,
            progressionStep = "5",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Success)
        val success = result as HabitValidationResult.Success
        assertEquals(1L, success.habit.goal.targetMinor)
        assertNull(success.habit.goal.unit)
        assertEquals(GoalDirection.AT_LEAST, success.habit.goal.direction)
        assertFalse(success.habit.timerEnabled)
        assertNull(success.habit.goal.minimumMinor)
        assertNull(success.habit.goal.frequencyTarget)
        assertNull(success.habit.goal.progression)
        assertEquals(listOf(1L), success.quickValues)
    }

    @Test
    fun `limited goal enforces AT_MOST direction and strips minimum and frequency`() {
        val draft = HabitDraft(
            id = "test-id",
            name = "Café",
            goalType = GoalType.COUNT,
            unit = MeasurementUnit.GLASS,
            target = "2",
            limited = true,
            minimum = "1",
            frequencyTarget = "2",
        )
        val result = validateAndBuildHabit(draft, existing = null)
        assertTrue(result is HabitValidationResult.Success)
        val success = result as HabitValidationResult.Success
        assertEquals(GoalDirection.AT_MOST, success.habit.goal.direction)
        assertNull(success.habit.goal.minimumMinor)
        assertNull(success.habit.goal.frequencyTarget)
        assertEquals(2L, success.habit.goal.targetMinor)
    }

    @Test
    fun `progression validation enforces positive step and cap`() {
        val draftBadStep = HabitDraft(
            id = "test-id",
            name = "Pompes",
            goalType = GoalType.COUNT,
            target = "10",
            progressive = true,
            progressionStep = "0",
        )
        val res1 = validateAndBuildHabit(draftBadStep, existing = null)
        assertTrue(res1 is HabitValidationResult.Error)
        assertEquals(R.string.form_error_progression_step, (res1 as HabitValidationResult.Error).messageResId)

        val draftBadCap = HabitDraft(
            id = "test-id",
            name = "Pompes",
            goalType = GoalType.COUNT,
            target = "10",
            progressive = true,
            progressionStep = "2",
            progressionCap = "0",
        )
        val res2 = validateAndBuildHabit(draftBadCap, existing = null)
        assertTrue(res2 is HabitValidationResult.Error)
        assertEquals(R.string.form_error_progression_cap, (res2 as HabitValidationResult.Error).messageResId)
    }

}
