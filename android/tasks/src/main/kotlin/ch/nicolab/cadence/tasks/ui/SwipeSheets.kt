@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.swipe.SchedulePreset
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val shortDay: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)

/** Menu d'un appui long : dates rapides, puis priorité, projet et suppression. */
@Composable
internal fun TaskMenuSheet(
    task: TaskItem,
    today: LocalDate,
    firstDayOfWeek: DayOfWeek,
    onSchedule: (LocalDate?) -> Unit,
    onAction: (SwipeAction) -> Unit,
    onDismiss: () -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    class Entry(val icon: ImageVector, val label: Int, val onClick: () -> Unit)
    val quickDates = listOf(SchedulePreset.TODAY, SchedulePreset.TOMORROW, SchedulePreset.WEEKEND).map { preset ->
        Entry(presetIcon(preset), presetLabel(preset)) { onSchedule(SchedulePreset.dateFor(preset, today, firstDayOfWeek)) }
    }
    val entries = quickDates + listOf(
        Entry(presetIcon(SchedulePreset.PICK), R.string.swipe_menu_pick) { picking = true },
        Entry(swipeActionIcon(SwipeAction.PRIORITY), R.string.swipe_action_priority) { onAction(SwipeAction.PRIORITY) },
        Entry(swipeActionIcon(SwipeAction.MOVE_PROJECT), R.string.tasks_field_project) { onAction(SwipeAction.MOVE_PROJECT) },
        Entry(swipeActionIcon(SwipeAction.DELETE), R.string.swipe_action_delete) { onAction(SwipeAction.DELETE) },
    )
    CadenceSheet(title = stringResource(R.string.swipe_menu_title), subtitle = task.name, dismiss = onDismiss) {
        RowGroup {
            entries.forEachIndexed { index, entry ->
                SettingRow(
                    title = stringResource(entry.label),
                    icon = entry.icon,
                    shape = rowGroupShape(index, entries.size),
                    trailing = {},
                    onClick = entry.onClick,
                )
            }
        }
    }
    if (picking) {
        TaskDatePickerDialog(
            initial = task.dueDay ?: today,
            onConfirm = { picking = false; onSchedule(it) },
            onDismiss = { picking = false },
        )
    }
}

/** Feuille « Planifier » : raccourcis de date, choix libre ou retrait de l'échéance. */
@Composable
internal fun ScheduleSheet(
    task: TaskItem,
    today: LocalDate,
    firstDayOfWeek: DayOfWeek,
    onPick: (LocalDate?) -> Unit,
    onDismiss: () -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    // Une série n'a pas de « sans date » : retirer l'échéance la ferait disparaître du serveur.
    val presets = SchedulePreset.entries.filter { !(it == SchedulePreset.NO_DATE && task.isRecurring) }
    CadenceSheet(title = stringResource(R.string.swipe_schedule_title), subtitle = task.name, dismiss = onDismiss) {
        RowGroup {
            presets.forEachIndexed { index, preset ->
                val date = SchedulePreset.dateFor(preset, today, firstDayOfWeek)
                SettingRow(
                    title = stringResource(presetLabel(preset)),
                    subtitle = date?.takeIf { preset != SchedulePreset.TODAY && preset != SchedulePreset.TOMORROW }?.format(shortDay),
                    icon = presetIcon(preset),
                    shape = rowGroupShape(index, presets.size),
                    trailing = {},
                    onClick = {
                        when (preset) {
                            SchedulePreset.PICK -> picking = true
                            SchedulePreset.NO_DATE -> onPick(null)
                            else -> onPick(date)
                        }
                    },
                )
            }
        }
    }
    if (picking) {
        TaskDatePickerDialog(
            initial = task.dueDay ?: today,
            onConfirm = { picking = false; onPick(it) },
            onDismiss = { picking = false },
        )
    }
}

private fun presetLabel(preset: SchedulePreset): Int = when (preset) {
    SchedulePreset.TODAY -> R.string.tasks_day_today
    SchedulePreset.TOMORROW -> R.string.tasks_day_tomorrow
    SchedulePreset.WEEKEND -> R.string.swipe_schedule_weekend
    SchedulePreset.NEXT_WEEK -> R.string.swipe_schedule_next_week
    SchedulePreset.PICK -> R.string.swipe_schedule_pick
    SchedulePreset.NO_DATE -> R.string.swipe_schedule_none
}

private fun presetIcon(preset: SchedulePreset) = when (preset) {
    SchedulePreset.TODAY -> Icons.Outlined.Today
    SchedulePreset.TOMORROW -> Icons.Outlined.Event
    SchedulePreset.WEEKEND -> Icons.Outlined.WbSunny
    SchedulePreset.NEXT_WEEK -> Icons.Outlined.EventRepeat
    SchedulePreset.PICK -> Icons.Outlined.CalendarMonth
    SchedulePreset.NO_DATE -> Icons.Outlined.Block
}

/** Feuille « Déplacer vers un projet » : « Aucun projet » en tête, puis les projets. */
@Composable
internal fun ProjectPickerSheet(
    task: TaskItem,
    projects: List<ProjectItem>,
    onPick: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    CadenceSheet(title = stringResource(R.string.swipe_project_title), subtitle = task.name, dismiss = onDismiss) {
        val count = projects.size + 1
        Column(Modifier.verticalScroll(rememberScrollState())) {
            RowGroup {
                SettingRow(
                    title = stringResource(R.string.tasks_no_project),
                    icon = Icons.Outlined.Block,
                    shape = rowGroupShape(0, count),
                    trailing = { if (task.projectUid == null) CurrentMark() },
                    onClick = { onPick(null) },
                )
                projects.forEachIndexed { index, project ->
                    SettingRow(
                        title = project.name,
                        icon = Icons.Outlined.Folder,
                        shape = rowGroupShape(index + 1, count),
                        trailing = { if (task.projectUid == project.uid) CurrentMark() },
                        onClick = { onPick(project.uid) },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

/** Feuille « Priorité » : haute, moyenne, basse ou aucune. */
@Composable
internal fun PrioritySheet(task: TaskItem, onPick: (Int?) -> Unit, onDismiss: () -> Unit) {
    val choices = listOf(
        TaskPriority.HIGH to R.string.tasks_priority_high,
        TaskPriority.MEDIUM to R.string.tasks_priority_medium,
        TaskPriority.LOW to R.string.tasks_priority_low,
        null to R.string.tasks_priority_none,
    )
    CadenceSheet(title = stringResource(R.string.swipe_priority_title), subtitle = task.name, dismiss = onDismiss) {
        RowGroup {
            choices.forEachIndexed { index, (priority, label) ->
                SettingRow(
                    title = stringResource(label),
                    shape = rowGroupShape(index, choices.size),
                    trailing = { if (task.priority == priority) CurrentMark() },
                    onClick = { onPick(priority) },
                )
            }
        }
    }
}

@Composable
private fun CurrentMark() {
    Icon(Icons.Outlined.Check, contentDescription = null, tint = cadence.primary)
}
