package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem

/** En retard, puis aujourd'hui, puis les tâches terminées (repliées par défaut). */
@Composable
internal fun TodayTab(
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.today.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    var completedExpanded by rememberSaveable { mutableStateOf(false) }

    LazyColumn(modifier = modifier, contentPadding = TasksListPadding) {
        if (state.overdue.isEmpty() && state.today.isEmpty()) {
            item { EmptyState(R.string.tasks_today_empty) }
        }
        if (state.overdue.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.tasks_section_overdue), MaterialTheme.colorScheme.error) }
            taskRows(state.overdue, projectNames, moment, viewModel, onOpen)
        }
        if (state.today.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.tasks_section_today)) }
            taskRows(state.today, projectNames, moment, viewModel, onOpen)
        }
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
