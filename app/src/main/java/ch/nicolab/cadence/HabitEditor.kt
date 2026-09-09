package ch.nicolab.cadence

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.mapSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ProgressionCadence
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.UnitDimension
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.HabitLabels
import ch.nicolab.cadence.ui.components.CadenceField
import ch.nicolab.cadence.ui.components.CadenceSheet
import ch.nicolab.cadence.ui.components.ChoiceChip
import ch.nicolab.cadence.ui.components.ErrorText
import ch.nicolab.cadence.ui.components.FieldGroup
import ch.nicolab.cadence.ui.components.HabitFacet
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.components.ToggleRow
import ch.nicolab.cadence.ui.components.onColorOf
import ch.nicolab.cadence.ui.icon.HabitIconPicker
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.theme.HabitColorChoices
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import ch.nicolab.cadence.ui.theme.habitAccent
import java.time.DayOfWeek
import java.time.LocalDate

private val DraftSaver = mapSaver(
    save = { d: HabitDraft -> mapOf(
        "id" to d.id, "name" to d.name, "description" to d.description, "icon" to d.iconId, "color" to d.colorArgb,
        "type" to d.goalType.name, "target" to d.target, "period" to d.period.name, "schedule" to d.scheduleMode.name,
        "days" to d.activeDays.map { it.name }, "first" to d.firstDay.name, "interval" to d.intervalDays,
        "unitId" to d.unit.id, "unitName" to d.unit.nameFr, "unitSymbol" to d.unit.symbol, "unitScale" to d.unit.scaleToCanonical, "dimension" to d.unit.dimension.name,
        "custom" to d.customUnit, "customId" to d.customUnitId, "customName" to d.customName, "customSymbol" to d.customSymbol,
        "quick" to d.quickValues, "reminders" to d.reminderTimes, "conditional" to d.conditionalReminders,
        "frequency" to d.frequencyTarget, "minimum" to d.minimum, "group" to d.groupId, "timer" to d.timerEnabled,
        "limited" to d.limited, "progressive" to d.progressive, "step" to d.progressionStep, "monthly" to d.progressionMonthly, "cap" to d.progressionCap,
    ) },
    restore = { m -> HabitDraft(
        id = m["id"] as String, name = m["name"] as String, description = m["description"] as String,
        iconId = m["icon"] as String, colorArgb = (m["color"] as? Number)?.toInt() ?: 0xFF5546EE.toInt(),
        goalType = GoalType.valueOf(m["type"] as String), target = m["target"] as String,
        period = PeriodType.valueOf(m["period"] as String), scheduleMode = ScheduleMode.valueOf(m["schedule"] as String),
        activeDays = (m["days"] as List<*>).map { DayOfWeek.valueOf(it as String) }.toSet(), firstDay = DayOfWeek.valueOf(m["first"] as String), intervalDays = m["interval"] as String,
        unit = MeasurementUnit(m["unitId"] as String, UnitDimension.valueOf(m["dimension"] as String), m["unitName"] as String, m["unitSymbol"] as String, (m["unitScale"] as? Number)?.toLong() ?: 1L),
        customUnit = m["custom"] as Boolean, customUnitId = (m["customId"] as? String).orEmpty(), customName = m["customName"] as String, customSymbol = m["customSymbol"] as String,
        quickValues = m["quick"] as String, reminderTimes = m["reminders"] as String, conditionalReminders = m["conditional"] as Boolean,
        frequencyTarget = m["frequency"] as String, minimum = m["minimum"] as String, groupId = m["group"] as String, timerEnabled = m["timer"] as Boolean,
        limited = m["limited"] as Boolean, progressive = m["progressive"] as Boolean, progressionStep = m["step"] as String, progressionMonthly = m["monthly"] as Boolean, progressionCap = m["cap"] as String,
    ) },
)

@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun HabitEditor(
    existing: HabitCardState?, groups: List<HabitGroup>, dismiss: () -> Unit, busy: Boolean, saveError: String?,
    save: (PersistedHabit, List<Long>, List<String>, Boolean, Boolean) -> Unit,
) {
    var draft by rememberSaveable(existing?.stored?.id, stateSaver = DraftSaver) { mutableStateOf(initialHabitDraft(existing)) }
    var customize by rememberSaveable { mutableStateOf(false) }
    var refine by rememberSaveable { mutableStateOf(false) }
    var organize by rememberSaveable { mutableStateOf(false) }
    var attempted by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val accent = cadence.habitAccent(draft.colorArgb)
    val result = remember(draft, existing) { validateAndBuildHabit(draft, existing) }
    val valid = result as? HabitValidationResult.Success
    val binary = draft.goalType == GoalType.BINARY
    val error = if (attempted && result is HabitValidationResult.Error) stringResource(result.messageResId) else saveError
    val previewHabit = valid?.habit ?: (validateAndBuildHabit(draft.copy(name = draft.name.ifBlank { "preview" }), existing) as? HabitValidationResult.Success)?.habit
    CadenceSheet(
        title = stringResource(if (existing == null) R.string.habit_editor_title_new else R.string.habit_editor_title_edit),
        subtitle = null, dismiss = { if (!busy) dismiss() },
        leading = { HabitFacet(HabitIconRegistry.getIcon(draft.iconId).imageVector, null, 0f, accent, cadence.sunken, size = Size.badge) },
    ) {
        Column(Modifier.weight(1f, fill = false).heightIn(max = Size.sheetContent).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.lg)) {
            CadenceField(draft.name, { draft = draft.copy(name = it) }, stringResource(R.string.form_name_label), placeholder = stringResource(R.string.form_name_placeholder), accent = accent)
            EditorChoices(stringResource(R.string.editor_measure), GoalType.entries, draft.goalType, accent, { stringResource(if (it == GoalType.BINARY) R.string.editor_measure_done else HabitLabels.goalTypeShort(it)) }) { type ->
                if (type != draft.goalType) draft = draft.copy(goalType = type, target = if (type == GoalType.BINARY) "1" else draft.target,
                    unit = when (type) { GoalType.DURATION -> MeasurementUnit.MINUTES; GoalType.COUNT -> MeasurementUnit.COUNT; else -> MeasurementUnit.MILLILITERS },
                    customUnit = false, limited = false, minimum = "", progressive = false, timerEnabled = type == GoalType.DURATION)
            }
            if (!binary) {
                Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    ChoiceChip(stringResource(R.string.form_direction_at_least), !draft.limited, accent = accent) { draft = draft.copy(limited = false) }
                    ChoiceChip(stringResource(R.string.form_direction_at_most), draft.limited, accent = accent) { draft = draft.copy(limited = true) }
                }
                CadenceField(draft.target, { draft = draft.copy(target = it) }, stringResource(if (draft.limited) R.string.form_limit_label else R.string.form_target_label), accent = accent, decimal = true)
                val units = when (draft.goalType) {
                    GoalType.DURATION -> listOf(MeasurementUnit.SECONDS, MeasurementUnit.MINUTES, MeasurementUnit.HOURS)
                    GoalType.COUNT -> MeasurementUnit.BUILT_INS.filter { it.dimension == UnitDimension.COUNT }
                    else -> MeasurementUnit.BUILT_INS.filter { it.dimension != UnitDimension.TIME && it.dimension != UnitDimension.COUNT }
                }
                FieldGroup(stringResource(R.string.form_unit_label)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                        (units + listOfNotNull(draft.unit.takeUnless { draft.customUnit || it in units })).forEach { unit ->
                            ChoiceChip(unit.symbol, !draft.customUnit && draft.unit == unit, accent = accent) { draft = draft.copy(unit = unit, customUnit = false) }
                        }
                        ChoiceChip(stringResource(R.string.form_unit_custom), draft.customUnit, accent = accent) { draft = draft.copy(customUnit = true) }
                    }
                }
                if (draft.customUnit) {
                    CadenceField(draft.customName, { draft = draft.copy(customName = it) }, stringResource(R.string.form_custom_unit_name), accent = accent)
                    CadenceField(draft.customSymbol, { draft = draft.copy(customSymbol = it) }, stringResource(R.string.form_custom_unit_symbol), accent = accent)
                }
            }
            EditorChoices(stringResource(R.string.editor_period), PeriodType.entries, draft.period, accent, { stringResource(HabitLabels.periodShort(it)) }) { draft = draft.copy(period = it) }
            EditorChoices(stringResource(R.string.editor_schedule), ScheduleMode.entries, draft.scheduleMode, accent, { stringResource(HabitLabels.scheduleMode(it)) }) { draft = draft.copy(scheduleMode = it) }
            if (draft.scheduleMode == ScheduleMode.SELECTED_DAYS) FieldGroup(stringResource(R.string.form_schedule_selected_days)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    DayOfWeek.entries.forEach { day -> ChoiceChip(stringResource(HabitLabels.dayShort(day)), day in draft.activeDays, accent = accent) {
                        draft = draft.copy(activeDays = if (day in draft.activeDays) draft.activeDays - day else draft.activeDays + day)
                    } }
                }
            }
            if (draft.scheduleMode == ScheduleMode.INTERVAL_DAYS) CadenceField(draft.intervalDays, { draft = draft.copy(intervalDays = it) }, stringResource(R.string.form_schedule_interval_days), numeric = true, accent = accent)
            if (draft.scheduleMode == ScheduleMode.FLEXIBLE_PERIOD) Text(stringResource(R.string.form_schedule_flexible_support), style = MaterialTheme.typography.bodySmall, color = cadence.inkMuted)
            if (previewHabit != null) Text(habitSummary(previewHabit, context), style = MaterialTheme.typography.bodyMedium, color = cadence.inkMuted)
            FoldHeading(stringResource(R.string.habit_editor_section_customize), customize) { customize = !customize }
            if (customize) {
                HabitIconPicker(draft.iconId, { draft = draft.copy(iconId = it) }, accent = accent)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    HabitColorChoices.forEachIndexed { index, color ->
                        val selectedColor = draft.colorArgb == color
                        val label = stringResource(R.string.editor_color_choice, index + 1)
                        Box(Modifier.size(Size.touch).clip(CircleShape).background(Color(color)).clickable(role = Role.RadioButton) { draft = draft.copy(colorArgb = color) }
                            .semantics { contentDescription = label; selected = selectedColor }, contentAlignment = Alignment.Center) {
                            if (selectedColor) Icon(Icons.Outlined.Check, null, tint = onColorOf(Color(color)), modifier = Modifier.size(Size.icon))
                        }
                    }
                }
                CadenceField(draft.description, { draft = draft.copy(description = it) }, stringResource(R.string.form_description_label), accent = accent)
            }
            FoldHeading(stringResource(R.string.habit_editor_section_refine), refine) { refine = !refine }
            if (refine) {
                if (!draft.limited || binary) {
                    if (!binary) CadenceField(draft.minimum, { draft = draft.copy(minimum = it) }, stringResource(R.string.form_minimum_label), support = stringResource(R.string.form_minimum_support), decimal = true, accent = accent)
                    CadenceField(draft.frequencyTarget, { draft = draft.copy(frequencyTarget = it) }, stringResource(R.string.form_frequency_label), support = stringResource(R.string.form_frequency_support), numeric = true, accent = accent)
                }
                if (!binary || draft.progressive) {
                    ToggleRow(stringResource(R.string.form_progression_label), draft.progressive, accent) { draft = draft.copy(progressive = it) }
                    if (draft.progressive) {
                        CadenceField(draft.progressionStep, { draft = draft.copy(progressionStep = it) }, stringResource(R.string.form_progression_step), decimal = true, accent = accent)
                        Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                            ChoiceChip(stringResource(R.string.form_progression_weekly), !draft.progressionMonthly, accent = accent) { draft = draft.copy(progressionMonthly = false) }
                            ChoiceChip(stringResource(R.string.form_progression_monthly), draft.progressionMonthly, accent = accent) { draft = draft.copy(progressionMonthly = true) }
                        }
                        CadenceField(draft.progressionCap, { draft = draft.copy(progressionCap = it) }, stringResource(R.string.form_progression_cap), decimal = true, accent = accent)
                    }
                }
                if (draft.period == PeriodType.WEEK) EditorChoices(stringResource(R.string.form_first_day_of_week_label), DayOfWeek.entries, draft.firstDay, accent, { stringResource(HabitLabels.dayShort(it)) }) { draft = draft.copy(firstDay = it) }
            }
            FoldHeading(stringResource(R.string.habit_editor_section_organize), organize) { organize = !organize }
            if (organize) {
                EditorChoices(stringResource(R.string.habit_form_group_label), groups, groups.firstOrNull { it.id == draft.groupId }, accent, { it.name }) { draft = draft.copy(groupId = it.id) }
                if (draft.goalType == GoalType.DURATION) ToggleRow(stringResource(R.string.timer_form_label), draft.timerEnabled, accent) { draft = draft.copy(timerEnabled = it) }
                if (!binary) CadenceField(draft.quickValues, { draft = draft.copy(quickValues = it) }, stringResource(R.string.form_quick_values_label), support = stringResource(R.string.editor_quick_help), accent = accent)
                CadenceField(draft.reminderTimes, { draft = draft.copy(reminderTimes = it) }, stringResource(R.string.form_reminders_label), support = stringResource(R.string.form_reminders_support), accent = accent)
                if (draft.reminderTimes.isNotBlank()) ToggleRow(stringResource(R.string.form_reminders_conditional), draft.conditionalReminders, accent) { draft = draft.copy(conditionalReminders = it) }
            }
        }
        Spacer(Modifier.height(Space.lg))
        error?.let { ErrorText(it); Spacer(Modifier.height(Space.sm)) }
        PrimaryAction(stringResource(if (busy) R.string.abstinence_saving else if (existing == null) R.string.form_btn_create else R.string.form_btn_save), Modifier.fillMaxWidth(), accent = accent, enabled = !busy) {
            attempted = true
            valid?.let { save(it.habit, it.quickValues, it.reminderTimes, it.conditionalReminders, it.isNew) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> EditorChoices(label: String, values: List<T>, selected: T?, accent: Color, text: @Composable (T) -> String, choose: (T) -> Unit) {
    FieldGroup(label) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            values.forEach { ChoiceChip(text(it), it == selected, accent = accent) { choose(it) } }
        }
    }
}

internal fun dayNameFr(day: DayOfWeek): String = when (day) {
    DayOfWeek.MONDAY -> "lundi"
    DayOfWeek.TUESDAY -> "mardi"
    DayOfWeek.WEDNESDAY -> "mercredi"
    DayOfWeek.THURSDAY -> "jeudi"
    DayOfWeek.FRIDAY -> "vendredi"
    DayOfWeek.SATURDAY -> "samedi"
    DayOfWeek.SUNDAY -> "dimanche"
}

internal fun formatSelectedDaysFr(days: Set<DayOfWeek>): String =
    DayOfWeek.entries.filter { it in days }.joinToString(", ") { dayNameFr(it) }

internal fun habitSummary(habit: PersistedHabit, context: Context): String {
    val goal = habit.goal
    val period = context.getString(
        when (goal.period) {
            PeriodType.DAY -> R.string.editor_summary_day
            PeriodType.WEEK -> R.string.editor_summary_week
            PeriodType.MONTH -> R.string.editor_summary_month
        },
    )
    fun amount(value: Long) = HabitFormatter.formatWithUnit(value, goal.goalType, goal.unit)
    val target = goal.targetAt(PeriodCalculator.window(LocalDate.now(), goal.period, habit.schedule.firstDayOfWeek).start)
    val parts = mutableListOf(
        context.getString(
            when {
                goal.goalType == GoalType.BINARY -> R.string.editor_summary_binary
                goal.isLimit -> R.string.editor_summary_limit
                else -> R.string.editor_summary_target
            },
            if (goal.goalType == GoalType.BINARY) target.toString() else amount(target),
            period,
        ),
    )
    goal.minimumMinor?.let { parts += context.getString(R.string.editor_summary_minimum, amount(it)) }
    goal.frequencyTarget?.let { parts += context.getString(R.string.editor_summary_frequency, it, period) }
    parts += when (habit.schedule.mode) {
        ScheduleMode.EVERY_DAY -> context.getString(R.string.editor_summary_every_day)
        ScheduleMode.FLEXIBLE_PERIOD -> context.getString(R.string.editor_summary_flexible)
        ScheduleMode.INTERVAL_DAYS -> context.getString(R.string.editor_summary_interval, habit.schedule.intervalDays)
        ScheduleMode.SELECTED_DAYS -> context.getString(R.string.editor_summary_selected, formatSelectedDaysFr(habit.schedule.activeDays))
    }
    goal.progression?.let { progression ->
        parts += context.getString(
            R.string.editor_summary_progression,
            amount(progression.step),
            context.getString(if (progression.cadence == ProgressionCadence.MONTHLY) R.string.editor_summary_month else R.string.editor_summary_week),
        )
        progression.capMinor?.let { parts += context.getString(R.string.editor_summary_cap, amount(it)) }
    }
    return parts.joinToString(" ")
}
