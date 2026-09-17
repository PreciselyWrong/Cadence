package ch.nicolab.cadence

import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalProgression
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ProgressionCadence
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.UnitDimension
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

internal data class HabitDraft(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val description: String = "",
    val iconId: String = HabitIconRegistry.DEFAULT_ICON_ID,
    val colorArgb: Int = 0xFF5546EE.toInt(),
    val goalType: GoalType = GoalType.BINARY,
    val target: String = "1",
    val unit: MeasurementUnit = MeasurementUnit.COUNT,
    val customUnit: Boolean = false,
    val customUnitId: String = "",
    val customName: String = "",
    val customSymbol: String = "",
    val period: PeriodType = PeriodType.DAY,
    val scheduleMode: ScheduleMode = ScheduleMode.EVERY_DAY,
    val activeDays: Set<DayOfWeek> = DayOfWeek.entries.toSet(),
    val firstDay: DayOfWeek = DayOfWeek.MONDAY,
    val quickValues: String = "1",
    val reminderTimes: String = "",
    val conditionalReminders: Boolean = true,
    val frequencyTarget: String = "",
    val intervalDays: String = "2",
    val groupId: String = HabitGroup.ALL_DAY_ID,
    val minimum: String = "",
    val timerEnabled: Boolean = false,
    val direction: GoalDirection = GoalDirection.AT_LEAST,
    val progressive: Boolean = false,
    val progressionStep: String = "",
    val progressionMonthly: Boolean = false,
    val progressionCap: String = "",
)

internal sealed interface HabitValidationResult {
    data class Success(
        val habit: PersistedHabit,
        val quickValues: List<Long>,
        val reminderTimes: List<String>,
        val conditionalReminders: Boolean,
        val isNew: Boolean,
    ) : HabitValidationResult

    data class Error(val messageResId: Int) : HabitValidationResult
}

internal fun initialHabitDraft(existing: HabitCardState?, initialDirection: GoalDirection = GoalDirection.AT_LEAST): HabitDraft {
    val stored = existing?.stored ?: return if (initialDirection == GoalDirection.TRACK_ONLY)
        HabitDraft(goalType = GoalType.COUNT, direction = initialDirection, target = "", unit = MeasurementUnit.COUNT)
    else HabitDraft()
    val goal = stored.goal
    val custom = goal.unit?.dimension == UnitDimension.CUSTOM
    val unit = goal.unit ?: MeasurementUnit.COUNT
    val scale = goal.unit?.scaleToCanonical ?: 1L
    val values = listOfNotNull(goal.targetMinor, goal.minimumMinor, goal.progression?.step, goal.progression?.capMinor) + existing.quickValues
    val displayUnit = if (!custom && values.any { !isFiniteDecimal(it, scale) }) canonicalUnit(unit) else unit
    val displayScale = displayUnit.scaleToCanonical
    fun value(minor: Long?) = minor?.let { formatMinorForDraft(it, displayScale) }.orEmpty()
    return HabitDraft(
        id = stored.id, name = stored.name, description = stored.description.orEmpty(),
        iconId = stored.iconId ?: HabitIconRegistry.DEFAULT_ICON_ID, colorArgb = stored.colorArgb ?: 0xFF5546EE.toInt(),
        goalType = goal.goalType, target = value(goal.targetMinor), unit = displayUnit, customUnit = custom,
        customUnitId = goal.unit?.id.orEmpty(), customName = if (custom) goal.unit?.nameFr.orEmpty() else "",
        customSymbol = if (custom) goal.unit?.symbol.orEmpty() else "", period = goal.period,
        scheduleMode = stored.schedule.mode, activeDays = stored.schedule.activeDays,
        firstDay = stored.schedule.firstDayOfWeek,
        quickValues = existing.quickValues.joinToString(" ") { formatMinorForDraft(it, displayScale) }.ifBlank { "1" },
        reminderTimes = existing.reminders.joinToString(", ") { it.time },
        conditionalReminders = existing.reminders.all { it.conditional },
        frequencyTarget = goal.frequencyTarget?.toString().orEmpty(), intervalDays = stored.schedule.intervalDays.toString(),
        groupId = stored.groupId, minimum = value(goal.minimumMinor), timerEnabled = stored.timerEnabled,
        direction = goal.direction, progressive = goal.progression != null,
        progressionStep = value(goal.progression?.step),
        progressionMonthly = goal.progression?.cadence == ProgressionCadence.MONTHLY,
        progressionCap = value(goal.progression?.capMinor),
    )
}

internal fun formatMinorForDraft(minor: Long, scale: Long): String = BigDecimal.valueOf(minor)
    .divide(BigDecimal.valueOf(scale))
    .stripTrailingZeros()
    .toPlainString()

private fun isFiniteDecimal(value: Long, scale: Long): Boolean {
    var denominator = scale / greatestCommonDivisor(value, scale)
    while (denominator % 2L == 0L) denominator /= 2L
    while (denominator % 5L == 0L) denominator /= 5L
    return denominator == 1L
}

private tailrec fun greatestCommonDivisor(left: Long, right: Long): Long =
    if (right == 0L) left else greatestCommonDivisor(right, left % right)

private fun canonicalUnit(unit: MeasurementUnit): MeasurementUnit = when (unit.dimension) {
    UnitDimension.TIME -> MeasurementUnit.SECONDS
    UnitDimension.DISTANCE -> MeasurementUnit.METERS
    UnitDimension.MASS -> MeasurementUnit.GRAMS
    UnitDimension.VOLUME -> MeasurementUnit.MILLILITERS
    else -> unit
}

internal fun validateAndBuildHabit(draft: HabitDraft, existing: HabitCardState?): HabitValidationResult {
    if (draft.name.isBlank()) return error(R.string.form_error_required_name)
    val base = existing?.stored
    val tracker = draft.direction == GoalDirection.TRACK_ONLY
    if (!tracker && draft.scheduleMode == ScheduleMode.SELECTED_DAYS && draft.activeDays.isEmpty()) return error(R.string.form_error_no_day)
    val interval = draft.intervalDays.trim().toIntOrNull()
    if (!tracker && draft.scheduleMode == ScheduleMode.INTERVAL_DAYS && (interval == null || interval < 2)) return error(R.string.form_error_interval_days)
    val reminders = draft.reminderTimes.split(',', ' ').map(String::trim).filter(String::isNotBlank)
    if (reminders.any { runCatching { LocalTime.parse(it) }.isFailure }) return error(R.string.form_error_time_format)

    val binary = draft.goalType == GoalType.BINARY
    if (tracker && binary) return error(R.string.form_error_tracker_type)
    val unit = when {
        binary -> null
        !draft.customUnit -> draft.unit
        draft.customName.isBlank() || draft.customSymbol.isBlank() -> return error(R.string.form_error_incomplete_unit)
        else -> MeasurementUnit(
            id = draft.customUnitId.ifBlank { "custom-${UUID.randomUUID()}" }, dimension = UnitDimension.CUSTOM,
            nameFr = draft.customName.trim(), symbol = draft.customSymbol.trim(), scaleToCanonical = draft.unit.scaleToCanonical,
        )
    }
    val scale = unit?.scaleToCanonical ?: 1L
    val preservedBinaryGoal = base?.goal?.takeIf { binary && it.goalType == GoalType.BINARY }
    val target = if (tracker) 0L else if (binary) preservedBinaryGoal?.targetMinor ?: 1L
    else decimalMinor(draft.target, scale) ?: return error(R.string.form_error_positive_target)
    val limit = !binary && draft.direction == GoalDirection.AT_MOST
    val minimum = if (tracker) null else if (preservedBinaryGoal != null) preservedBinaryGoal.minimumMinor else if (!binary && !limit && draft.minimum.isNotBlank()) {
        decimalMinor(draft.minimum, scale)?.takeIf { it <= target } ?: return error(R.string.form_error_minimum)
    } else null
    val frequency = if (!tracker && !limit && draft.frequencyTarget.isNotBlank()) {
        draft.frequencyTarget.trim().toIntOrNull()?.takeIf { it > 0 } ?: return error(R.string.form_error_positive_frequency)
    } else null
    val progression = if (tracker) null else if (preservedBinaryGoal != null) {
        if (draft.progressive) preservedBinaryGoal.progression else null
    } else if (!binary && draft.progressive) {
        val step = decimalMinor(draft.progressionStep, scale) ?: return error(R.string.form_error_progression_step)
        val cap = if (draft.progressionCap.isBlank()) null else decimalMinor(draft.progressionCap, scale)
            ?: return error(R.string.form_error_progression_cap)
        if (cap != null && cap < target) return error(R.string.form_error_progression_cap_below_target)
        GoalProgression(step, if (draft.progressionMonthly) ProgressionCadence.MONTHLY else ProgressionCadence.WEEKLY, cap,
            base?.goal?.progression?.startsOn ?: LocalDate.now())
    } else null
    val quick = if (binary) existing?.quickValues?.takeIf(List<Long>::isNotEmpty) ?: listOf(1L)
    else parseQuickValues(draft.quickValues, scale, if (tracker) scale else target) ?: return error(R.string.form_error_quick_values)
    val goal = HabitGoal(target, if (tracker) PeriodType.DAY else draft.period, draft.goalType, unit, frequency, minimum,
        if (binary) GoalDirection.AT_LEAST else draft.direction, progression)
    val schedule = HabitSchedule(if (tracker) ScheduleMode.EVERY_DAY else draft.scheduleMode, draft.activeDays, draft.firstDay, interval ?: 2)
    val habit = base?.copy(
        name = draft.name.trim(), description = draft.description.trim().ifBlank { null }, iconId = draft.iconId,
        colorArgb = draft.colorArgb, groupId = draft.groupId, timerEnabled = draft.timerEnabled && draft.goalType == GoalType.DURATION,
        goal = goal, schedule = schedule,
    ) ?: PersistedHabit(
        id = draft.id, name = draft.name.trim(), description = draft.description.trim().ifBlank { null }, iconId = draft.iconId, colorArgb = draft.colorArgb, active = true,
        startsOn = LocalDate.now(), groupId = draft.groupId, timerEnabled = draft.timerEnabled && draft.goalType == GoalType.DURATION,
        goal = goal, schedule = schedule,
    )
    return HabitValidationResult.Success(habit, quick, reminders, !tracker && draft.conditionalReminders, base == null)
}

private fun decimalMinor(raw: String, scale: Long): Long? = runCatching {
    BigDecimal(raw.trim().replace(',', '.')).multiply(BigDecimal.valueOf(scale)).setScale(0, RoundingMode.UNNECESSARY).longValueExact()
}.getOrNull()?.takeIf { it > 0 }

private fun parseQuickValues(raw: String, scale: Long, fallback: Long): List<Long>? {
    if (raw.isBlank()) return listOf(fallback)
    val tokens = raw.replace(Regex(",(?=\\s)"), " ").split(Regex("[;\\s]+"))
        .map(String::trim).filter(String::isNotEmpty)
    if (tokens.isEmpty()) return listOf(fallback)
    return tokens.map { decimalMinor(it, scale) ?: return null }
}

private fun error(messageResId: Int) = HabitValidationResult.Error(messageResId)
