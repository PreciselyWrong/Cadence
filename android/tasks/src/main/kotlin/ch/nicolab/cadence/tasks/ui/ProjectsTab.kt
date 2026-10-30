package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.getValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.model.ProjectCard
import ch.nicolab.cadence.tasks.model.TaskOverviews
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem

/**
 * Projets groupés par domaine : pastille de couleur, nom (qui passe à la ligne), prochaine tâche,
 * nombre de tâches ouvertes et barre d'avancement. Toucher ouvre le projet.
 */
@Composable
internal fun ProjectsTab(
    viewModel: TasksViewModel,
    onOpenProject: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val areas by viewModel.areas.collectAsStateWithLifecycle()
    val tasks by viewModel.allTasks.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val groups = remember(projects, areas, tasks, moment.now) {
        TaskOverviews.projectGroups(projects, areas, tasks, moment.now)
    }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (groups.isEmpty()) {
            item { EmptyState(R.string.tasks_projects_empty) }
        }
        groups.forEach { group ->
            item(key = "area-${group.area?.uid ?: "none"}") {
                SectionHeader(title = group.area?.name ?: stringResource(R.string.tasks_projects_no_area))
            }
            itemsIndexed(group.projects, key = { _, card -> card.project.uid }) { index, card ->
                ProjectCardRow(
                    card = card,
                    shape = rowGroupShape(index, group.projects.size),
                    onClick = { onOpenProject(card.project.uid) },
                    modifier = Modifier.padding(bottom = Space.groupGap),
                )
            }
        }
    }
}

@Composable
private fun ProjectCardRow(card: ProjectCard, shape: Shape, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    val color = projectRailColor(card.project.color)?.let(::Color) ?: palette.primary
    val progressDescription = stringResource(R.string.tasks_projects_progress, card.doneCount, card.openCount + card.doneCount)
    Panel(modifier = modifier, shape = shape, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(Space.md).clip(CircleShape).background(color))
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(
                    card.project.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.onSurface,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    card.nextTaskName?.let { stringResource(R.string.tasks_projects_next, it) }
                        ?: stringResource(R.string.tasks_projects_done_all),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(Space.md))
            Text(card.openCount.toString(), style = MaterialTheme.typography.titleLarge, color = palette.onSurface)
        }
        Spacer(Modifier.height(Space.sm))
        Box(
            Modifier
                .fillMaxWidth()
                .height(Size.counterTrack)
                .clip(Radius.Pill)
                .background(palette.containerHigh)
                .semantics { contentDescription = progressDescription },
        ) {
            Box(Modifier.fillMaxWidth(card.progress).height(Size.counterTrack).clip(Radius.Pill).background(color))
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
    val projectColors = rememberProjectColors(viewModel)
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
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (tasks.isEmpty()) {
            item { EmptyState(R.string.tasks_project_empty) }
        }
        taskRows(tasks, projectNames, projectColors, moment, viewModel, onOpen)
    }
}
