@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
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
import ch.nicolab.cadence.tasks.model.NextAction
import ch.nicolab.cadence.tasks.model.ProjectCard
import ch.nicolab.cadence.tasks.model.TaskOverviews
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.pluralStringResource
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.tasks.model.AreaGroup
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.ProjectStatus

/** « N actifs · N dans le stash » : le stash n'apparaît que s'il n'est pas vide. */
@Composable
internal fun projectCounterLine(projects: List<ProjectItem>): String {
    val stash = projects.count { it.projectStatus.isStash }
    val active = projects.count { !it.projectStatus.isClosed && !it.projectStatus.isStash }
    val activeText = pluralStringResource(R.plurals.tasks_projects_active, active, active)
    return if (stash == 0) activeText else stringResource(
        R.string.tasks_projects_counter,
        activeText,
        stringResource(R.string.tasks_projects_stash_count, stash),
    )
}

internal fun projectStatusLabel(status: ProjectStatus): Int = when (status) {
    ProjectStatus.NOT_STARTED -> R.string.tasks_project_status_not_started
    ProjectStatus.PLANNED -> R.string.tasks_project_status_planned
    ProjectStatus.IN_PROGRESS -> R.string.tasks_project_status_in_progress
    ProjectStatus.WAITING -> R.string.tasks_project_status_waiting
    ProjectStatus.DONE -> R.string.tasks_project_status_done
    ProjectStatus.CANCELLED -> R.string.tasks_project_status_cancelled
    ProjectStatus.PAUSED -> R.string.tasks_project_status_paused
    ProjectStatus.ARCHIVED -> R.string.tasks_project_status_archived
}

/** Choix du statut d'un projet : la valeur courante est cochée, un appui l'applique et ferme la feuille. */
@Composable
internal fun ProjectStatusSheet(
    project: ProjectItem,
    onPick: (ProjectStatus) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    CadenceSheet(title = stringResource(R.string.tasks_project_status_title), subtitle = project.name, dismiss = onDismiss) {
        RowGroup {
            ProjectStatus.entries.forEachIndexed { index, status ->
                SettingRow(
                    title = stringResource(projectStatusLabel(status)),
                    shape = rowGroupShape(index, ProjectStatus.entries.size),
                    trailing = {
                        if (status == project.projectStatus) {
                            Icon(Icons.Outlined.Check, contentDescription = null, tint = palette.primary)
                        }
                    },
                    onClick = {
                        onPick(status)
                        onDismiss()
                    },
                )
            }
        }
    }
}

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
    val projects by viewModel.visibleProjects.collectAsStateWithLifecycle()
    val allProjects by viewModel.projects.collectAsStateWithLifecycle()
    val areas by viewModel.areas.collectAsStateWithLifecycle()
    val areaNames = suggestedAreaNames()
    val tasks by viewModel.allTasks.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val overview = remember(projects, areas, tasks, moment.now) {
        TaskOverviews.projectOverview(projects, areas, tasks, moment.now)
    }
    var showClosed by rememberSaveable { mutableStateOf(false) }
    var statusFor by remember { mutableStateOf<String?>(null) }
    val onLongClick = { card: ProjectCard -> statusFor = card.project.uid }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (areas.isEmpty()) {
            item(key = "suggest-areas") { SuggestAreasButton(onClick = { viewModel.suggestAreas(areaNames) }) }
        }
        if (overview.activeCount + overview.stashCount + overview.closedCount == 0) {
            item { EmptyState(R.string.tasks_projects_empty) }
        }
        val labelActive = overview.stashCount > 0
        if (labelActive) {
            item(key = "active") {
                SectionHeader(title = stringResource(R.string.tasks_projects_active_header), count = overview.activeCount)
            }
        }
        areaGroups("active", overview.active, onOpenProject, onLongClick)
        if (overview.stashCount > 0) {
            item(key = "stash") {
                SectionHeader(title = stringResource(R.string.tasks_projects_stash), count = overview.stashCount)
            }
            val stash = overview.stash.flatMap { it.projects }
            itemsIndexed(stash, key = { _, card -> "stash-${card.project.uid}" }) { index, card ->
                ProjectCardRow(
                    card = card,
                    shape = rowGroupShape(index, stash.size),
                    onClick = { onOpenProject(card.project.uid) },
                    onLongClick = { onLongClick(card) },
                    modifier = Modifier.padding(bottom = Space.groupGap),
                )
            }
        }
        if (overview.closedCount > 0) {
            item(key = "closed-toggle") {
                TextButton(onClick = { showClosed = !showClosed }) {
                    Text(
                        if (showClosed) {
                            stringResource(R.string.tasks_projects_closed_hide)
                        } else {
                            stringResource(R.string.tasks_projects_closed_show, overview.closedCount)
                        },
                    )
                }
            }
            if (showClosed) areaGroups("closed", overview.closed, onOpenProject, onLongClick)
        }
    }

    val editing = allProjects.firstOrNull { it.uid == statusFor }
    if (editing != null) {
        ProjectStatusSheet(
            project = editing,
            onPick = { viewModel.setProjectStatus(editing.uid, it) },
            onDismiss = { statusFor = null },
        )
    }
}

private fun LazyListScope.areaGroups(
    prefix: String,
    groups: List<AreaGroup>,
    onOpenProject: (String) -> Unit,
    onLongClick: (ProjectCard) -> Unit,
) {
    groups.forEach { group ->
        item(key = "$prefix-area-${group.area?.uid ?: "none"}") {
            SectionHeader(title = group.area?.name ?: stringResource(R.string.tasks_projects_no_area))
        }
        itemsIndexed(group.projects, key = { _, card -> "$prefix-${card.project.uid}" }) { index, card ->
            ProjectCardRow(
                card = card,
                shape = rowGroupShape(index, group.projects.size),
                onClick = { onOpenProject(card.project.uid) },
                onLongClick = { onLongClick(card) },
                modifier = Modifier.padding(bottom = Space.groupGap),
            )
        }
    }
}

@Composable
private fun ProjectCardRow(
    card: ProjectCard,
    shape: Shape,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val color = projectRailColor(card.project.color)?.let(::Color) ?: palette.primary
    val progressDescription = stringResource(R.string.tasks_projects_progress, card.doneCount, card.openCount + card.doneCount)
    Panel(modifier = modifier, shape = shape, onClick = onClick, onLongClick = onLongClick) {
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
                    card.nextActionName?.let { stringResource(R.string.next_action_line, it) }
                        ?: card.nextTaskName?.let { stringResource(R.string.tasks_projects_next, it) }
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
    val project = projects.firstOrNull { it.uid == projectUid }
    val projectName = project?.name.orEmpty()
    var editingStatus by remember { mutableStateOf(false) }
    // La prochaine action choisie ; sinon la suggestion automatique (la première tâche ouverte).
    val nextLine = project?.let { NextAction.of(it, tasks) }?.let { stringResource(R.string.next_action_line, it.name) }
        ?: tasks.firstOrNull()?.let { stringResource(R.string.tasks_projects_next, it.name) }

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
                if (project != null) {
                    TextButton(onClick = { editingStatus = true }) {
                        Text(stringResource(projectStatusLabel(project.projectStatus)))
                    }
                }
            }
        }
        if (nextLine != null) {
            item(key = "next-action") {
                Text(
                    nextLine,
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = Space.md, end = Space.md, bottom = Space.sm),
                )
            }
        }
        if (tasks.isEmpty()) {
            item { EmptyState(R.string.tasks_project_empty) }
        }
        taskRows(tasks, projectNames, projectColors, moment, viewModel, onOpen)
    }

    if (editingStatus && project != null) {
        ProjectStatusSheet(
            project = project,
            onPick = { viewModel.setProjectStatus(project.uid, it) },
            onDismiss = { editingStatus = false },
        )
    }
}
