package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SectionTone
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem

/**
 * En retard, puis aujourd'hui (tâches et événements de l'agenda mêlés par heure), puis les tâches
 * terminées (repliées par défaut).
 */
@Composable
internal fun TodayTab(
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
    routineStrip: @Composable () -> Unit = {},
) {
    val state by viewModel.today.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val events by viewModel.todayEvents.collectAsStateWithLifecycle()
    val calendarSettings by viewModel.calendarSettings.collectAsStateWithLifecycle()
    val calendarNoticeVisible by viewModel.calendarNoticeVisible.collectAsStateWithLifecycle()
    val agenda = remember(state.today, events, moment.zone) {
        mergeTodayItems(state.today, events, moment.zone)
    }
    val projectNames = rememberProjectNames(viewModel)
    var completedExpanded by rememberSaveable { mutableStateOf(false) }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (calendarNoticeVisible) {
            item(key = "calendar-notice") {
                CalendarPermissionNotice(
                    onGranted = viewModel::refreshCalendar,
                    onDismiss = viewModel::dismissCalendarNotice,
                    modifier = Modifier.padding(bottom = Space.sm),
                )
            }
        }
        if (state.overdue.isEmpty() && agenda.isEmpty()) {
            item { EmptyState(R.string.tasks_today_empty) }
        }
        if (state.overdue.isNotEmpty()) {
            item {
                SectionHeader(
                    title = stringResource(R.string.tasks_section_overdue),
                    count = state.overdue.size,
                    tone = SectionTone.Error,
                )
            }
            taskRows(state.overdue, projectNames, moment, viewModel, onOpen)
        }
        if (agenda.isNotEmpty()) {
            item { SectionHeader(title = stringResource(R.string.tasks_section_today), count = agenda.size) }
            agendaRows(agenda, projectNames, moment, viewModel, onOpen, calendarSettings.checkEvents)
        }
        item(key = "routine") { routineStrip() }
        if (state.completed.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { completedExpanded = !completedExpanded }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.tasks_section_completed, state.completed.size),
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        if (completedExpanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                        contentDescription = null,
                    )
                }
            }
            if (completedExpanded) {
                taskRows(state.completed, projectNames, moment, viewModel, onOpen)
            }
        }
    }
}

/** Tâches et événements d'Aujourd'hui, dans l'ordre fourni par [mergeTodayItems]. */
private fun LazyListScope.agendaRows(
    agenda: List<TodayItem>,
    projectNames: Map<String, String>,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    checkEvents: Boolean,
) {
    items(agenda, key = { it.key }) { item ->
        when (item) {
            is TodayItem.Task -> TaskRow(
                task = item.task,
                projectName = item.task.projectUid?.let { projectNames[it] },
                today = moment.today,
                zone = moment.zone,
                onToggle = { viewModel.toggle(item.task) },
                onOpen = { onOpen(item.task) },
                onPostpone = { viewModel.postpone(item.task) },
            )
            is TodayItem.Event -> EventRow(
                item = item.event,
                zone = moment.zone,
                checkable = checkEvents,
                onToggle = { viewModel.toggleEvent(item.event.event.key) },
            )
        }
    }
}
