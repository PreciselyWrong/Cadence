package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem

/** Projets avec leur nombre de tâches ouvertes ; toucher ouvre le projet. */
@Composable
internal fun ProjectsTab(
    viewModel: TasksViewModel,
    onOpenProject: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val rows by viewModel.projectRows.collectAsStateWithLifecycle()

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (rows.isEmpty()) {
            item { EmptyState(R.string.tasks_projects_empty) }
        }
        items(rows, key = { it.project.uid }) { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenProject(row.project.uid) }
                    .padding(horizontal = 4.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = row.project.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = pluralStringResource(R.plurals.tasks_open_count, row.openCount, row.openCount),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Tâches ouvertes d'un projet, avec retour vers la liste des projets. */
@Composable
internal fun ProjectTasksPane(
    viewModel: TasksViewModel,
    projectUid: String,
    onBack: () -> Unit,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tasks by remember(projectUid) { viewModel.observeProjectTasks(projectUid) }
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectName = projects.firstOrNull { it.uid == projectUid }?.name.orEmpty()

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Outlined.ArrowBack,
                        contentDescription = stringResource(R.string.tasks_back),
                    )
                }
                Text(
                    text = projectName,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (tasks.isEmpty()) {
            item { EmptyState(R.string.tasks_project_empty) }
        }
        taskRows(tasks, projectNames, moment, viewModel, onOpen)
    }
}
