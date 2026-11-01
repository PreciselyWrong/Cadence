package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TagPaths
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskOverviews

/**
 * Étiquettes en arbre repliable (`perso` › `sport` › `course`) : un nom court sous son parent, le nombre de
 * tâches ouvertes du parent comprend celles de ses sous-étiquettes. Toucher ouvre les tâches de l'étiquette.
 */
@Composable
internal fun TagsTab(
    viewModel: TasksViewModel,
    onOpenTag: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val tasks by viewModel.allTasks.collectAsStateWithLifecycle()
    var collapsed by rememberSaveable { mutableStateOf(emptyList<String>()) }
    val counts = remember(tags, tasks) { TaskOverviews.tagCards(tags, tasks).associate { it.tag.uid to it.openCount } }
    val rows = remember(tags, collapsed) { TagPaths.rows(tags, collapsed.toSet()) }
    val nested = remember(rows) { rows.any { it.hasChildren } }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (rows.isEmpty()) {
            item { EmptyState(R.string.tasks_tags_empty) }
        }
        itemsIndexed(rows, key = { _, row -> row.tag.uid }) { index, row ->
            val tag = row.tag
            val isCollapsed = tag.uid in collapsed
            val tint = projectRailColor(tag.color)?.let(::Color) ?: cadence.outline
            val icon = entityIcon(tag.icon)
            Panel(
                modifier = Modifier.padding(bottom = Space.groupGap),
                shape = rowGroupShape(index, rows.size),
                onClick = { onOpenTag(tag.uid) },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.width(Space.xl * row.depth))
                    if (nested) {
                        if (row.hasChildren) {
                            val action = stringResource(
                                if (isCollapsed) R.string.tasks_tag_expand else R.string.tasks_tag_collapse,
                                tag.name,
                            )
                            Box(
                                Modifier
                                    .size(Size.touch)
                                    .clip(CircleShape)
                                    .clickable(onClickLabel = action) {
                                        collapsed = if (isCollapsed) collapsed - tag.uid else collapsed + tag.uid
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    if (isCollapsed) Icons.Outlined.ChevronRight else Icons.Outlined.ExpandMore,
                                    contentDescription = action,
                                    tint = cadence.onSurfaceVariant,
                                    modifier = Modifier.size(Size.icon),
                                )
                            }
                        } else {
                            Spacer(Modifier.width(Size.touch))
                        }
                    }
                    if (icon != null) {
                        EntityIcon(icon, tint = if (tag.color == null) cadence.onSurfaceVariant else tint)
                    } else {
                        Box(Modifier.size(Space.md).clip(CircleShape).background(tint))
                    }
                    Spacer(Modifier.width(Space.md))
                    Text(
                        row.label,
                        style = MaterialTheme.typography.titleMedium,
                        color = cadence.onSurface,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(Space.md))
                    Text((counts[tag.uid] ?: 0).toString(), style = MaterialTheme.typography.titleLarge, color = cadence.onSurface)
                }
            }
        }
    }
}

/** Tâches ouvertes d'une étiquette, avec retour vers la liste des étiquettes. */
@Composable
internal fun TagTasksPane(
    viewModel: TasksViewModel,
    tagUid: String,
    onBack: () -> Unit,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val all by viewModel.allTasks.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    val tag = tags.firstOrNull { it.uid == tagUid }
    val name = tag?.name.orEmpty()
    val icon = entityIcon(tag?.icon)
    val tasks = remember(all, tags, tagUid, moment.now) { TaskOverviews.ofTag(all, tags, tagUid, moment.now) }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = stringResource(R.string.tasks_back))
                }
                if (icon != null) {
                    EntityIcon(icon, tint = projectRailColor(tag?.color)?.let(::Color) ?: cadence.onSurfaceVariant)
                    Spacer(Modifier.width(Space.sm))
                }
                Text(
                    text = name,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (tasks.isEmpty()) {
            item { EmptyState(R.string.tasks_tag_empty) }
        }
        taskRows(tasks, projectNames, projectColors, moment, viewModel, onOpen)
    }
}

/** Tâches terminées, du jour le plus récent au plus ancien. */
@Composable
internal fun DoneTab(
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val all by viewModel.allTasks.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    val groups = remember(all, moment.zone) { TaskOverviews.completedByDay(all, moment.zone) }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (groups.isEmpty()) {
            item { EmptyState(R.string.tasks_done_empty) }
        }
        groups.forEach { (day, tasks) ->
            item(key = "done-$day") { SectionHeader(title = dayLabel(day, moment.today), count = tasks.size) }
            taskRows(tasks, projectNames, projectColors, moment, viewModel, onOpen, sectionDay = day)
        }
    }
}
