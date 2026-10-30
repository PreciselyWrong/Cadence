package ch.nicolab.cadence.tasks.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.model.TaskItem

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
    selectedTaskUid?.let { uid ->
        TaskDetailSheet(taskUid = uid, viewModel = viewModel, onDismiss = onCloseTask)
    }
    if (pendingMove != null) {
        RecurringMoveDialog(onAnswer = viewModel::answerRecurringMove)
    }
}

/** Lignes de tâches partagées par tous les écrans de liste. */
internal fun LazyListScope.taskRows(
    tasks: List<TaskItem>,
    projectNames: Map<String, String>,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
) {
    items(tasks, key = { it.uid }) { task ->
        TaskRow(
            task = task,
            projectName = task.projectUid?.let { projectNames[it] },
            today = moment.today,
            zone = moment.zone,
            onToggle = { viewModel.toggle(task) },
            onOpen = { onOpen(task) },
            onPostpone = { viewModel.postpone(task) },
        )
    }
}
