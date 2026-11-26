package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.BadgeTone
import ch.nicolab.cadence.designsystem.components.CadenceBadge
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.ProjectHealth
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.SubProjectBoard
import ch.nicolab.cadence.tasks.model.TaskItem

/**
 * Tableau « Tâches par projet » d'un projet parent : une colonne par sous-projet en cours (et le parent lui-même),
 * l'État actuel du fichier TODO.md sous l'en-tête, les tâches par section du fichier. Lecture et coche seulement :
 * les tâches se classent dans le fichier, pas par glisser.
 */
@Composable
internal fun SubProjectBoardView(
    parent: ProjectItem,
    projects: List<ProjectItem>,
    allTasks: List<TaskItem>,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    onOpenProject: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val columns = remember(parent, projects, allTasks) { SubProjectBoard.columns(parent, projects, allTasks) }
    if (columns.isEmpty()) {
        EmptyState(R.string.project_board_empty)
        return
    }
    BoxWithConstraints(modifier) {
        val columnWidth = (maxWidth * 0.85f).coerceIn(240.dp, 360.dp)
        LazyRow(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = Space.md, vertical = Space.sm),
            horizontalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            items(columns, key = { it.project.uid }) { column ->
                SubProjectColumn(
                    column = column,
                    moment = moment,
                    viewModel = viewModel,
                    onOpen = onOpen,
                    onOpenProject = onOpenProject,
                    modifier = Modifier.width(columnWidth).fillMaxHeight(),
                )
            }
        }
    }
}

@Composable
private fun SubProjectColumn(
    column: SubProjectBoard.Column,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    onOpenProject: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val project = column.project
    val groups = remember(column.tasks) { SubProjectBoard.groupBySection(column.tasks) }
    val health = SubProjectBoard.health(project.handoff, moment.now)
    Surface(
        shape = Radius.Card,
        color = cadence.containerLow,
        border = BorderStroke(Size.hairline, cadence.outlineVariant),
        modifier = modifier,
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.xs),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenProject(project.uid) }
                    .padding(horizontal = Space.md, vertical = Space.sm),
            ) {
                Text(
                    text = project.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = cadence.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (health == ProjectHealth.BLOCKED || health == ProjectHealth.STALE) {
                    val blocked = health == ProjectHealth.BLOCKED
                    Surface(
                        shape = CircleShape,
                        color = if (blocked) cadence.error else cadence.onSurfaceVariant,
                        modifier = Modifier.size(Space.sm),
                        content = {},
                    )
                }
                Text(
                    text = column.tasks.size.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    color = cadence.onSurfaceVariant,
                )
            }
            CurrentState(project, health, moment)
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = Space.sm, vertical = Space.xs),
                verticalArrangement = Arrangement.spacedBy(Space.xs),
            ) {
                groups.forEach { group ->
                    val key = group.label.orEmpty()
                    item(key = "$key|group") {
                        if (group.showTitle) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(Space.xs),
                                modifier = Modifier.padding(horizontal = Space.xs, vertical = Space.xs),
                            ) {
                                Text(
                                    text = group.label ?: stringResource(R.string.project_board_others),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = cadence.onSurfaceVariant,
                                )
                                Text(
                                    text = group.tasks.size.toString(),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = cadence.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    sectionCards(key, group.tasks, moment, viewModel, onOpen)
                }
            }
        }
    }
}

/** « → prochaine action » sur deux lignes au plus, et « Bloqué » ou « Périmé · il y a N j » seulement s'il y a lieu. */
@Composable
private fun CurrentState(project: ProjectItem, health: ProjectHealth?, moment: Moment) {
    val handoff = project.handoff ?: return
    val next = handoff.nextAction
    if (next == null && health != ProjectHealth.BLOCKED && health != ProjectHealth.STALE) return
    Column(
        verticalArrangement = Arrangement.spacedBy(Space.xs),
        modifier = Modifier.fillMaxWidth().padding(start = Space.md, end = Space.md, bottom = Space.sm),
    ) {
        if (next != null) {
            Text(
                text = stringResource(R.string.project_board_next_action, next),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        when (health) {
            ProjectHealth.BLOCKED -> CadenceBadge(stringResource(R.string.project_board_blocked), tone = BadgeTone.Error)
            ProjectHealth.STALE -> CadenceBadge(
                stringResource(R.string.project_board_stale, SubProjectBoard.ageDays(handoff, moment.now) ?: 0),
                tone = BadgeTone.Neutral,
            )
            else -> Unit
        }
    }
}

/** Les cartes d'une section, repliées après huit derrière « Afficher les N autres » ; le dépli est gardé par la clé de l'élément. */
private fun LazyListScope.sectionCards(
    key: String,
    tasks: List<TaskItem>,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
) {
    item(key = "$key|cards") {
        var expanded by rememberSaveable { mutableStateOf(false) }
        val folded = SubProjectBoard.fold(tasks, expanded)
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            folded.shown.forEach { task ->
                BoardTaskCard(
                    task = task,
                    moment = moment,
                    viewModel = viewModel,
                    onOpen = { onOpen(task) },
                    onMoveSection = null,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (folded.hidden > 0) {
                TextButton(onClick = { expanded = true }) {
                    Text(pluralStringResource(R.plurals.project_board_show_more, folded.hidden, folded.hidden))
                }
            }
        }
    }
}
