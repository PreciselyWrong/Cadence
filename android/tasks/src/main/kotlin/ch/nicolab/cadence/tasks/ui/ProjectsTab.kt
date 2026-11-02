@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.AreaGroup
import ch.nicolab.cadence.tasks.model.NextAction
import ch.nicolab.cadence.tasks.model.Outline
import ch.nicolab.cadence.tasks.model.ProjectCard
import ch.nicolab.cadence.tasks.model.ProjectHierarchy
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.SubProject
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskOverviews

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

/** Ce que fait un statut qui sort le projet de la liste active ; null pour les autres. */
internal fun projectStatusHint(status: ProjectStatus): Int? = when (status) {
    ProjectStatus.PAUSED -> R.string.tasks_project_status_paused_hint
    ProjectStatus.CANCELLED -> R.string.tasks_project_status_cancelled_hint
    ProjectStatus.ARCHIVED -> R.string.tasks_project_status_archived_hint
    else -> null
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

/**
 * Choix du statut d'un projet : la valeur courante est cochée, un appui l'applique et ferme la feuille.
 * Avec [onEditIcon] et [onEditParent], deux lignes mènent au choix de l'icône et du projet parent.
 */
@Composable
internal fun ProjectStatusSheet(
    project: ProjectItem,
    onPick: (ProjectStatus) -> Unit,
    onDismiss: () -> Unit,
    parentName: String? = null,
    onEditIcon: (() -> Unit)? = null,
    onEditParent: (() -> Unit)? = null,
) {
    val palette = cadence
    CadenceSheet(title = stringResource(R.string.tasks_project_status_title), subtitle = project.name, dismiss = onDismiss) {
        RowGroup {
            ProjectStatus.entries.forEachIndexed { index, status ->
                SettingRow(
                    title = stringResource(projectStatusLabel(status)),
                    subtitle = projectStatusHint(status)?.let { stringResource(it) },
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
        if (onEditIcon != null && onEditParent != null) {
            Spacer(Modifier.height(Space.lg))
            RowGroup {
                SettingRow(
                    title = stringResource(R.string.tasks_edit_icon),
                    shape = rowGroupShape(0, 2),
                    trailing = { IconValue(project.icon) },
                    onClick = onEditIcon,
                )
                SettingRow(
                    title = stringResource(R.string.tasks_edit_parent),
                    subtitle = parentName ?: stringResource(R.string.tasks_edit_parent_none),
                    shape = rowGroupShape(1, 2),
                    onClick = onEditParent,
                )
            }
        }
    }
}

/**
 * Projets groupés par domaine, en lignes simples : couleur, nom, prochaine tâche et nombre ouvert.
 * Toucher ouvre le projet ; appui long pour son statut et ses réglages.
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
        ProjectEditSheets(project = editing, viewModel = viewModel, onDismiss = { statusFor = null })
    }
}

private fun LazyListScope.areaGroups(
    prefix: String,
    groups: List<AreaGroup>,
    onOpenProject: (String) -> Unit,
    onLongClick: (ProjectCard) -> Unit,
) {
    groups.forEach { group ->
        // « Sans domaine » ne s'écrit que s'il y a d'autres domaines à distinguer.
        if (group.area != null || groups.size > 1) {
            item(key = "$prefix-area-${group.area?.uid ?: "none"}") {
                SectionHeader(title = group.area?.name ?: stringResource(R.string.tasks_projects_no_area))
            }
        }
        itemsIndexed(group.projects, key = { _, card -> "$prefix-${card.project.uid}" }) { index, card ->
            ProjectCardRow(
                card = card,
                shape = rowGroupShape(index, group.projects.size),
                onClick = { onOpenProject(card.project.uid) },
                onLongClick = { onLongClick(card) },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ProjectCardRow(
    card: ProjectCard,
    shape: Shape,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Une ligne simple, comme une liste de Things : couleur du projet, nom, prochaine tâche, nombre ouvert.
    // Pas de carte ni de barre d'avancement vide ; un projet sans tâche ouverte n'affiche pas « 0 ».
    val palette = cadence
    val color = projectRailColor(card.project.color)?.let(::Color) ?: palette.onSurfaceVariant
    val progressDescription = stringResource(R.string.tasks_projects_progress, card.doneCount, card.openCount + card.doneCount)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clip(shape)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .semantics { stateDescription = progressDescription }
            .padding(vertical = Space.sm, horizontal = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val icon = entityIcon(card.project.icon)
        if (icon != null) {
            EntityIcon(icon, tint = color)
        } else {
            Box(Modifier.size(Size.icon), contentAlignment = Alignment.Center) {
                Box(Modifier.size(Space.md).clip(CircleShape).background(color))
            }
        }
        Spacer(Modifier.width(Space.md))
        Column(Modifier.weight(1f)) {
            Text(
                card.project.name,
                style = MaterialTheme.typography.bodyLarge,
                color = palette.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            (card.nextActionName?.let { stringResource(R.string.next_action_line, it) }
                ?: card.nextTaskName?.let { stringResource(R.string.tasks_projects_next, it) })?.let { next ->
                Text(
                    next,
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (card.openCount > 0) {
            Spacer(Modifier.width(Space.md))
            Text(card.openCount.toString(), style = MaterialTheme.typography.labelLarge, color = palette.onSurfaceVariant)
        }
    }
}

/** Tâches ouvertes d'un projet, avec retour vers la liste des projets. */
@Composable
internal fun ProjectTasksPane(
    viewModel: TasksViewModel,
    projectUid: String,
    onBack: () -> Unit,
    onOpenProject: (String) -> Unit,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val allTasks by viewModel.allTasks.collectAsStateWithLifecycle()
    val tasks by remember(projectUid) { viewModel.observeProjectTasks(projectUid) }
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectColors = rememberProjectColors(viewModel)
    val project = projects.firstOrNull { it.uid == projectUid }
    val projectName = project?.name.orEmpty()
    val ancestors = remember(projects, projectUid) { ProjectHierarchy.ancestors(projects, projectUid) }
    val subProjects = remember(projects, allTasks, projectUid) { ProjectHierarchy.children(projects, projectUid, allTasks) }
    val headerIcon = entityIcon(project?.icon)
    val headerColor = projectRailColor(project?.color)?.let(::Color) ?: cadence.primary
    var editingStatus by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val layouts = remember(context) { LayoutStore(context) }
    var outline by rememberSaveable { mutableStateOf(layouts.isOn(LayoutStore.OUTLINE)) }
    var selectedRow by rememberSaveable(projectUid) { mutableStateOf<String?>(null) }
    val every by viewModel.everyTask.collectAsStateWithLifecycle()
    val tree = remember(tasks, every) { Outline.tree(tasks, every) }
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
                Column(Modifier.weight(1f)) {
                    if (ancestors.isNotEmpty()) ProjectBreadcrumb(ancestors, onOpenProject)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (headerIcon != null) {
                            EntityIcon(headerIcon, tint = headerColor, size = Size.iconLarge)
                            Spacer(Modifier.width(Space.sm))
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
                IconButton(
                    onClick = {
                        outline = !outline
                        layouts.set(LayoutStore.OUTLINE, outline)
                    },
                ) {
                    Icon(
                        if (outline) Icons.AutoMirrored.Outlined.ViewList else Icons.Outlined.AccountTree,
                        contentDescription = stringResource(if (outline) R.string.outline_hide else R.string.outline_show),
                    )
                }
                if (project != null) {
                    TextButton(onClick = { editingStatus = true }) {
                        Text(stringResource(projectStatusLabel(project.projectStatus)))
                    }
                    // Épingler sert rarement : dans le menu, comme sur le web, jamais en bouton visible.
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Outlined.MoreVert, contentDescription = stringResource(R.string.tasks_project_more))
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text(stringResource(if (project.pinToSidebar) R.string.tasks_action_unpin else R.string.tasks_action_pin)) },
                                leadingIcon = { Icon(if (project.pinToSidebar) Icons.Filled.PushPin else Icons.Outlined.PushPin, contentDescription = null) },
                                onClick = {
                                    menuOpen = false
                                    viewModel.setProjectPinned(project.uid, !project.pinToSidebar)
                                },
                            )
                        }
                    }
                }
            }
        }
        if (project?.isFileBacked == true) {
            item(key = "todo-md-repo") {
                TodoMdRepoLine(
                    projectUid = projectUid,
                    onChanged = viewModel::requestSync,
                    modifier = Modifier.padding(start = Space.md, end = Space.md, bottom = Space.xs),
                )
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
        if (subProjects.isNotEmpty()) {
            item(key = "sub-projects") { SectionHeader(title = stringResource(R.string.tasks_subprojects_title), count = subProjects.size) }
            itemsIndexed(subProjects, key = { _, sub -> "sub-${sub.project.uid}" }) { index, sub ->
                SubProjectRow(sub, rowGroupShape(index, subProjects.size)) { onOpenProject(sub.project.uid) }
            }
        }
        if (tasks.isEmpty() && subProjects.isEmpty()) {
            item { EmptyState(R.string.tasks_project_empty) }
        }
        if (outline) {
            outlineItems(
                rows = Outline.rows(tree),
                selected = selectedRow,
                onSelect = { selectedRow = it },
                actions = OutlineActions(
                    tree = tree,
                    // Un projet TODO.md se lit dans son fichier : seule la case s'y écrit.
                    editable = project?.isFileBacked != true,
                    apply = { after -> viewModel.applyOutline(tree, after) },
                    addAfter = { uid, name -> viewModel.addOutlineSibling(projectUid, tree, uid, name) },
                    toggle = { viewModel.toggle(it, hold = true) },
                    open = onOpen,
                ),
            )
        } else {
            // L'en-tête porte déjà le projet : les lignes ne répètent pas son nom.
            taskRows(tasks, emptyMap(), projectColors, moment, viewModel, onOpen)
        }
    }

    if (editingStatus && project != null) {
        ProjectEditSheets(project = project, viewModel = viewModel, onDismiss = { editingStatus = false })
    }
}

/** Fil d'Ariane d'un sous-projet : les parents, la racine d'abord, chacun ouvre son projet. */
@Composable
private fun ProjectBreadcrumb(ancestors: List<ProjectItem>, onOpen: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
        ancestors.forEach { parent ->
            val label = stringResource(R.string.tasks_project_open_named, parent.name)
            Box(
                Modifier
                    .heightIn(min = Size.touch)
                    .clip(Radius.Chip)
                    .clickable(onClickLabel = label) { onOpen(parent.uid) }
                    .padding(horizontal = Space.xs),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    parent.name,
                    style = MaterialTheme.typography.labelLarge,
                    color = cadence.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text("›", style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant, modifier = Modifier.padding(horizontal = Space.xs))
        }
    }
}

/** Un sous-projet comme un dossier : icône, nom, tâches ouvertes, chevron. */
@Composable
private fun SubProjectRow(sub: SubProject, shape: Shape, onClick: () -> Unit) {
    val color = projectRailColor(sub.project.color)?.let(::Color) ?: cadence.primary
    val icon = entityIcon(sub.project.icon) ?: Icons.Outlined.Folder
    Panel(modifier = Modifier.padding(bottom = Space.groupGap), shape = shape, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EntityIcon(icon, tint = color)
            Spacer(Modifier.width(Space.md))
            Text(
                sub.project.name,
                style = MaterialTheme.typography.titleMedium,
                color = cadence.onSurface,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(Space.md))
            Text(
                pluralStringResource(R.plurals.tasks_open_count, sub.openCount, sub.openCount),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = cadence.onSurfaceVariant, modifier = Modifier.size(Size.icon))
        }
    }
}
