@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.SwapHoriz
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
import ch.nicolab.cadence.tasks.menu.TaskMenu
import ch.nicolab.cadence.tasks.menu.TaskMenuAction
import ch.nicolab.cadence.tasks.menu.TaskMenuInput
import ch.nicolab.cadence.tasks.model.Funnel
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.project.canBecomeProject
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.swipe.FileBackedActions
import ch.nicolab.cadence.tasks.swipe.SchedulePreset
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

// L'interface est en français : la date suit, quelle que soit la langue de l'appareil.
private val shortDay: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.FRENCH)

/**
 * Menu d'un appui long : dates rapides, puis priorité, projet et suppression. Une tâche d'un fichier
 * TODO.md n'y trouve que terminer ou rouvrir.
 */
@Composable
internal fun TaskMenuSheet(
    task: TaskItem,
    today: LocalDate,
    firstDayOfWeek: DayOfWeek,
    weekStart: LocalDate,
    onOpen: () -> Unit = {},
    onSchedule: (LocalDate?) -> Unit,
    onAction: (SwipeAction) -> Unit,
    onFunnel: (FunnelStage) -> Unit,
    onPin: () -> Unit = {},
    onDuplicate: () -> Unit = {},
    onCopyLink: () -> Unit = {},
    onCopyTitle: () -> Unit = {},
    /** null : la tâche ne peut pas être une prochaine action ; sinon, l'est-elle déjà ? */
    nextAction: Boolean? = null,
    onNextAction: () -> Unit = {},
    onToProject: () -> Unit = {},
    /** Dans la liste Aujourd'hui : monter ou descendre d'un rang ; null au bord ou hors de cette liste. */
    onMoveUp: (() -> Unit)? = null,
    onMoveDown: (() -> Unit)? = null,
    onMoveSection: (() -> Unit)? = null,
    onDismiss: () -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    var confirmingProject by remember { mutableStateOf(false) }
    val menuEntries = remember(task, onMoveUp != null, onMoveDown != null, onMoveSection != null, nextAction) {
        TaskMenu.entries(
            TaskMenuInput(
                task = task,
                canMoveUp = onMoveUp != null,
                canMoveDown = onMoveDown != null,
                canMoveSection = onMoveSection != null,
                nextAction = nextAction,
            ),
        )
    }
    class Entry(val icon: ImageVector, val label: Int, val onClick: () -> Unit)
    val rows = menuEntries.map { entry ->
        when (entry.action) {
            TaskMenuAction.MOVE_UP -> Entry(Icons.Outlined.ArrowUpward, R.string.today_move_up) {
                onMoveUp?.invoke()
                onDismiss()
            }
            TaskMenuAction.MOVE_DOWN -> Entry(Icons.Outlined.ArrowDownward, R.string.today_move_down) {
                onMoveDown?.invoke()
                onDismiss()
            }
            TaskMenuAction.MOVE_SECTION -> Entry(Icons.Outlined.SwapHoriz, R.string.project_board_move_to) {
                onDismiss()
                onMoveSection?.invoke()
            }
            TaskMenuAction.OPEN -> Entry(Icons.AutoMirrored.Outlined.OpenInNew, R.string.task_menu_open) {
                onOpen()
                onDismiss()
            }
            TaskMenuAction.TOGGLE -> Entry(
                Icons.Outlined.Check,
                if (entry.active) R.string.task_menu_reopen else R.string.task_menu_complete,
            ) {
                onAction(SwipeAction.COMPLETE)
                onDismiss()
            }
            TaskMenuAction.DATE -> Entry(Icons.Outlined.CalendarMonth, R.string.task_menu_date) {
                onAction(SwipeAction.SCHEDULE)
            }
            TaskMenuAction.PRIORITY -> Entry(swipeActionIcon(SwipeAction.PRIORITY), R.string.task_menu_priority) {
                onAction(SwipeAction.PRIORITY)
            }
            TaskMenuAction.PROJECT -> Entry(swipeActionIcon(SwipeAction.MOVE_PROJECT), R.string.task_menu_project) {
                onAction(SwipeAction.MOVE_PROJECT)
            }
            TaskMenuAction.PIN -> Entry(
                Icons.Outlined.PushPin,
                if (entry.active) R.string.task_menu_unpin else R.string.task_menu_pin,
            ) {
                onPin()
                onDismiss()
            }
            TaskMenuAction.FUNNEL_IN_VIEW -> {
                val on = Funnel.has(task, FunnelStage.IN_VIEW, weekStart)
                Entry(funnelIcon(FunnelStage.IN_VIEW), if (on) funnelOffLabel(FunnelStage.IN_VIEW) else funnelLabel(FunnelStage.IN_VIEW)) {
                    onFunnel(FunnelStage.IN_VIEW)
                }
            }
            TaskMenuAction.FUNNEL_THIS_WEEK -> {
                val on = Funnel.has(task, FunnelStage.THIS_WEEK, weekStart)
                Entry(funnelIcon(FunnelStage.THIS_WEEK), if (on) funnelOffLabel(FunnelStage.THIS_WEEK) else funnelLabel(FunnelStage.THIS_WEEK)) {
                    onFunnel(FunnelStage.THIS_WEEK)
                }
            }
            TaskMenuAction.FUNNEL_LATER -> {
                val on = Funnel.has(task, FunnelStage.LATER, weekStart)
                Entry(funnelIcon(FunnelStage.LATER), if (on) funnelOffLabel(FunnelStage.LATER) else funnelLabel(FunnelStage.LATER)) {
                    onFunnel(FunnelStage.LATER)
                }
            }
            TaskMenuAction.NEXT_ACTION -> Entry(
                Icons.Outlined.Flag,
                if (entry.active) R.string.next_action_menu_clear else R.string.next_action_menu_set,
            ) {
                onNextAction()
                onDismiss()
            }
            TaskMenuAction.DUPLICATE -> Entry(Icons.Outlined.ContentCopy, R.string.task_menu_duplicate) {
                onDuplicate()
                onDismiss()
            }
            TaskMenuAction.TURN_INTO_PROJECT -> Entry(Icons.Outlined.AccountTree, R.string.task_menu_to_project) {
                confirmingProject = true
            }
            TaskMenuAction.COPY_LINK -> Entry(Icons.Outlined.Link, R.string.task_menu_copy_link) {
                onCopyLink()
                onDismiss()
            }
            TaskMenuAction.COPY_TITLE -> Entry(Icons.Outlined.ContentCopy, R.string.task_menu_copy_title) {
                onCopyTitle()
                onDismiss()
            }
            TaskMenuAction.DELETE -> Entry(swipeActionIcon(SwipeAction.DELETE), R.string.task_menu_delete) {
                onAction(SwipeAction.DELETE)
                onDismiss()
            }
        }
    }
    CadenceSheet(title = stringResource(R.string.swipe_menu_title), subtitle = task.name, dismiss = onDismiss) {
        Column(Modifier.verticalScroll(rememberScrollState())) {
            RowGroup {
                rows.forEachIndexed { index, entry ->
                    SettingRow(
                        title = stringResource(entry.label),
                        icon = entry.icon,
                        shape = rowGroupShape(index, rows.size),
                        trailing = {},
                        onClick = entry.onClick,
                    )
                }
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
    if (confirmingProject) {
        ConvertToProjectDialog(
            name = task.name,
            onConfirm = {
                confirmingProject = false
                onToProject()
                onDismiss()
            },
            onDismiss = { confirmingProject = false },
        )
    }
}

private fun funnelOffLabel(stage: FunnelStage): Int = when (stage) {
    FunnelStage.IN_VIEW -> R.string.funnel_out_of_view
    FunnelStage.THIS_WEEK -> R.string.funnel_not_this_week
    FunnelStage.LATER -> R.string.funnel_not_later
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
