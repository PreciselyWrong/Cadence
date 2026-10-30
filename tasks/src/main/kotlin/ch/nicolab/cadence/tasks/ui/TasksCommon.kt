package ch.nicolab.cadence.tasks.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.tasks.model.TaskItem

/** Marge basse pour que le bouton d'ajout ne masque pas la dernière ligne. */
internal val TasksListPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 96.dp)

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
internal fun SectionHeader(text: String, color: Color = Color.Unspecified) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = color,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

@Composable
internal fun rememberProjectNames(viewModel: TasksViewModel): Map<String, String> {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    return remember(projects) { projects.associate { it.uid to it.name } }
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
