package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.views.OnlineViewResult
import ch.nicolab.cadence.tasks.views.SavedView
import ch.nicolab.cadence.tasks.views.SavedViewFilter
import ch.nicolab.cadence.tasks.views.ViewEvaluation
import kotlinx.coroutines.CancellationException

/**
 * Tâches d'une vue enregistrée : filtres évalués localement sur Room quand c'est possible,
 * sinon lecture en ligne via `/api/v1/search`, sinon « Vue disponible sur le web ».
 */
@Composable
internal fun ViewTasksPane(
    viewModel: TasksViewModel,
    savedView: SavedView,
    onBack: () -> Unit,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val allTasks by viewModel.allTasks.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.views(context) }

    val localEval = remember(savedView, allTasks, tags, moment.today, moment.now) {
        SavedViewFilter.evaluate(savedView, allTasks, tags, moment.today, moment.now)
    }

    var onlineLoading by remember(savedView.uid) { mutableStateOf(false) }
    var onlineResult by remember(savedView.uid) { mutableStateOf<OnlineViewResult?>(null) }
    var onlineOffline by remember(savedView.uid) { mutableStateOf(false) }

    LaunchedEffect(savedView, localEval) {
        if (localEval !is ViewEvaluation.NeedsOnlineOrWeb) {
            onlineLoading = false
            onlineResult = null
            onlineOffline = false
            return@LaunchedEffect
        }
        onlineLoading = true
        onlineOffline = false
        try {
            onlineResult = client.fetchTaskUidsOnline(savedView)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            onlineOffline = true
        } finally {
            onlineLoading = false
        }
    }

    val displayedTasks: List<TaskItem>? = when (localEval) {
        is ViewEvaluation.Local -> localEval.tasks
        is ViewEvaluation.NeedsOnlineOrWeb -> when (val res = onlineResult) {
            is OnlineViewResult.TaskUids -> {
                val byUid = allTasks.associateBy { it.uid }
                res.uids.mapNotNull(byUid::get)
            }
            else -> null
        }
    }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = stringResource(R.string.tasks_back))
                }
                Icon(Icons.Outlined.FilterList, contentDescription = null, tint = cadence.onSurfaceVariant)
                Spacer(Modifier.width(Space.sm))
                Text(savedView.name, style = MaterialTheme.typography.titleLarge)
            }
        }
        when {
            localEval is ViewEvaluation.NeedsOnlineOrWeb && onlineLoading -> item {
                Row(
                    Modifier.fillMaxWidth().padding(vertical = Space.xl),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            localEval is ViewEvaluation.NeedsOnlineOrWeb && onlineOffline -> item {
                EmptyState(R.string.views_offline)
            }
            localEval is ViewEvaluation.NeedsOnlineOrWeb && onlineResult is OnlineViewResult.WebOnly -> item {
                EmptyState(R.string.views_web_only)
            }
            displayedTasks != null && displayedTasks.isEmpty() -> item {
                EmptyState(R.string.views_empty)
            }
            displayedTasks != null -> {
                taskRows(displayedTasks, projectNames, projectColors, moment, viewModel, onOpen)
            }
        }
    }
}
