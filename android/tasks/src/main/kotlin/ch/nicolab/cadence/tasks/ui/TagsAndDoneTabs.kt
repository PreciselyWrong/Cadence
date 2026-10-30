package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskOverviews

/** Étiquettes avec leur nombre de tâches ouvertes ; toucher ouvre les tâches de l'étiquette. */
@Composable
internal fun TagsTab(
    viewModel: TasksViewModel,
    onOpenTag: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val tasks by viewModel.allTasks.collectAsStateWithLifecycle()
    val cards = remember(tags, tasks) { TaskOverviews.tagCards(tags, tasks) }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (cards.isEmpty()) {
            item { EmptyState(R.string.tasks_tags_empty) }
        }
        itemsIndexed(cards, key = { _, card -> card.tag.uid }) { index, card ->
            Panel(
                modifier = Modifier.padding(bottom = Space.groupGap),
                shape = rowGroupShape(index, cards.size),
                onClick = { onOpenTag(card.tag.uid) },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(Space.md)
                            .clip(CircleShape)
                            .background(projectRailColor(card.tag.color)?.let(::Color) ?: cadence.outline),
                    )
                    Spacer(Modifier.width(Space.md))
                    Text(
                        card.tag.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = cadence.onSurface,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(Space.md))
                    Text(card.openCount.toString(), style = MaterialTheme.typography.titleLarge, color = cadence.onSurface)
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
    val name = tags.firstOrNull { it.uid == tagUid }?.name.orEmpty()
    val tasks = remember(all, tagUid, moment.now) { TaskOverviews.ofTag(all, tagUid, moment.now) }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = stringResource(R.string.tasks_back))
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
