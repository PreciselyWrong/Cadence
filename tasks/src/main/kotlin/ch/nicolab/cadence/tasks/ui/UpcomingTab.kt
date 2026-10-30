package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem

/** Les 7 prochains jours, un en-tête par jour. */
@Composable
internal fun UpcomingTab(
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val upcoming by viewModel.upcoming.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)

    LazyColumn(modifier = modifier, contentPadding = TasksListPadding) {
        if (upcoming.isEmpty()) {
            item { EmptyState(R.string.tasks_upcoming_empty) }
        }
        upcoming.forEach { (date, tasks) ->
            item(key = "day-$date") { SectionHeader(dayLabel(date, moment.today)) }
            taskRows(tasks, projectNames, moment, viewModel, onOpen)
        }
    }
}
