package ch.nicolab.cadence.tasks.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDate
import java.time.temporal.WeekFields
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * Marges des listes : elles défilent sous la barre flottante, donc la dernière ligne
 * doit s'arrêter au-dessus de la barre et du bouton d'ajout.
 */
@Composable
internal fun tasksListPadding(): PaddingValues = PaddingValues(
    start = Space.gutter,
    top = Space.sm,
    end = Space.gutter,
    bottom = navigationClearance() + Size.fab + Space.xl,
)

@Composable
internal fun EmptyState(@StringRes message: Int) {
    Text(
        text = stringResource(message),
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
    )
}

@Composable
internal fun rememberProjectNames(viewModel: TasksViewModel): Map<String, String> {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    return remember(projects) { projects.associate { it.uid to it.name } }
}

@Composable
internal fun rememberProjectColors(viewModel: TasksViewModel): Map<String, Int> {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    return remember(projects) {
        projects.mapNotNull { project -> projectRailColor(project.color)?.let { project.uid to it } }.toMap()
    }
}

/** Couleur `#RRGGBB` d'un projet en ARGB opaque ; null si elle est absente ou illisible (pas de liseré). */
internal fun projectRailColor(value: String?): Int? {
    val hex = value?.trim()?.removePrefix("#") ?: return null
    if (hex.length != 6) return null
    val rgb = hex.toIntOrNull(16) ?: return null
    return (0xFF000000L or rgb.toLong()).toInt()
}

/**
 * Effets communs aux écrans de tâches : messages en bandeau, fiche d'une tâche et
 * question de déplacement d'une occurrence récurrente.
 */
@Composable
internal fun TaskOverlays(
    viewModel: TasksViewModel,
    snackbar: SnackbarHostState,
    selectedTaskUid: String?,
    onCloseTask: () -> Unit,
) {
    val pendingMove by viewModel.pendingMove.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) {
        viewModel.messages.collect { snackbar.showSnackbar(it) }
    }
    val undoLabel = stringResource(R.string.tasks_undo)
    val context = LocalContext.current
    LaunchedEffect(viewModel) {
        viewModel.completed.collect { task ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(
                    message = context.getString(R.string.tasks_completed_named, task.name),
                    actionLabel = undoLabel,
                    duration = SnackbarDuration.Short,
                )
                if (result == SnackbarResult.ActionPerformed) viewModel.undoComplete(task.uid)
            }
        }
    }
    LaunchedEffect(viewModel) {
        viewModel.notices.collect { notice ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(
                    message = notice.message,
                    actionLabel = undoLabel,
                    duration = SnackbarDuration.Short,
                )
                if (result == SnackbarResult.ActionPerformed) notice.undo()
            }
        }
    }
    selectedTaskUid?.let { uid ->
        TaskDetailSheet(taskUid = uid, viewModel = viewModel, onDismiss = onCloseTask)
    }
    SwipeSheets(viewModel)
    val pendingDelete by viewModel.pendingDelete.collectAsStateWithLifecycle()
    if (pendingDelete != null) {
        RecurringDeleteDialog(onAnswer = viewModel::answerRecurringDelete)
    }
    if (pendingMove != null) {
        RecurringMoveDialog(onAnswer = viewModel::answerRecurringMove)
    }
}

/** Feuille ouverte par un balayage (planifier, projet, priorité). */
@Composable
private fun SwipeSheets(viewModel: TasksViewModel) {
    val sheet by viewModel.sheet.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val firstDay = remember { WeekFields.of(Locale.getDefault()).firstDayOfWeek }
    when (val open = sheet) {
        null -> Unit
        is SwipeSheet.Menu -> TaskMenuSheet(
            task = open.task,
            today = moment.today,
            firstDayOfWeek = firstDay,
            onSchedule = { viewModel.reschedule(open.task, it) },
            onAction = { viewModel.swipe(open.task, it) },
            onDismiss = viewModel::dismissSheet,
        )
        is SwipeSheet.Schedule -> ScheduleSheet(
            task = open.task,
            today = moment.today,
            firstDayOfWeek = firstDay,
            onPick = { viewModel.reschedule(open.task, it) },
            onDismiss = viewModel::dismissSheet,
        )
        is SwipeSheet.Project -> ProjectPickerSheet(
            task = open.task,
            projects = projects,
            onPick = { viewModel.moveToProject(open.task, it) },
            onDismiss = viewModel::dismissSheet,
        )
        is SwipeSheet.Priority -> PrioritySheet(
            task = open.task,
            onPick = { viewModel.setPriority(open.task, it) },
            onDismiss = viewModel::dismissSheet,
        )
    }
}

/** Lignes de tâches partagées par tous les écrans de liste. */
internal fun LazyListScope.taskRows(
    tasks: List<TaskItem>,
    projectNames: Map<String, String>,
    projectColors: Map<String, Int>,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    sectionDay: LocalDate? = null,
) {
    items(tasks, key = { it.uid }) { task ->
        TaskRow(
            modifier = Modifier.animateItem(),
            task = task,
            projectName = task.projectUid?.let { projectNames[it] },
            projectColor = task.projectUid?.let { projectColors[it] },
            today = moment.today,
            zone = moment.zone,
            onToggle = { viewModel.toggle(task, hold = true) },
            onOpen = { onOpen(task) },
            onSwipeAction = { viewModel.swipe(task, it) },
            onMenu = { viewModel.openMenu(task) },
            sectionDay = sectionDay,
        )
    }
}
