package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.history.HistoryLabel
import ch.nicolab.cadence.tasks.history.HistoryLine
import ch.nicolab.cadence.tasks.history.HistorySource
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlinx.coroutines.CancellationException

private sealed interface HistoryState {
    data object Loading : HistoryState
    data object Unavailable : HistoryState
    data class Loaded(val lines: List<HistoryLine>) : HistoryState
}

/**
 * « Historique » d'une tâche, replié : le toucher lit les évènements en ligne et déplie la liste. Hors ligne ou en
 * erreur : une seule ligne.
 */
@Composable
internal fun TaskHistorySection(taskUid: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var open by rememberSaveable(taskUid) { mutableStateOf(false) }
    var state by remember(taskUid) { mutableStateOf<HistoryState>(HistoryState.Loading) }
    LaunchedEffect(open, taskUid) {
        if (!open) return@LaunchedEffect
        state = HistoryState.Loading
        state = try {
            HistoryState.Loaded(TasksGraph.history(context).of(taskUid))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            HistoryState.Unavailable
        }
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Row(
            Modifier
                .heightIn(min = Size.touch)
                .clickable(role = Role.Button) { open = !open },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.xs),
        ) {
            Icon(Icons.Outlined.History, contentDescription = null, tint = cadence.onSurfaceVariant, modifier = Modifier.size(18.dp))
            Text(stringResource(R.string.task_history_title), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
        }
        if (!open) return@Column
        when (val current = state) {
            HistoryState.Loading -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            HistoryState.Unavailable -> Text(stringResource(R.string.history_unavailable), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            is HistoryState.Loaded -> current.lines.forEach { line ->
                Column(Modifier.padding(vertical = 2.dp)) {
                    Text(label(line), style = MaterialTheme.typography.bodyMedium)
                    val meta = meta(line)
                    if (meta.isNotEmpty()) Text(meta, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun label(line: HistoryLine): String = when (line.label) {
    HistoryLabel.CREATED -> stringResource(R.string.history_created)
    HistoryLabel.DUE_DATE -> stringResource(R.string.history_due, day(line.dueFrom), day(line.dueTo))
    HistoryLabel.NAME -> stringResource(R.string.history_name)
    HistoryLabel.NOTE -> stringResource(R.string.history_note)
    HistoryLabel.PROJECT -> stringResource(R.string.history_project)
    HistoryLabel.STATUS -> stringResource(R.string.history_status)
    HistoryLabel.COMPLETED -> stringResource(R.string.history_completed)
    HistoryLabel.ARCHIVED -> stringResource(R.string.history_archived)
    HistoryLabel.PRIORITY -> stringResource(R.string.history_priority)
    HistoryLabel.TAGS -> stringResource(R.string.history_tags)
    HistoryLabel.DEFERRED -> stringResource(R.string.history_deferred)
    HistoryLabel.COMMENT -> stringResource(R.string.history_comment)
    HistoryLabel.RELATION_ADDED -> stringResource(R.string.history_relation_added)
    HistoryLabel.RELATION_REMOVED -> stringResource(R.string.history_relation_removed)
    HistoryLabel.OCCURRENCE_DONE -> stringResource(R.string.history_occurrence_done)
    HistoryLabel.OCCURRENCE_SKIPPED -> stringResource(R.string.history_occurrence_skipped)
    HistoryLabel.OTHER -> stringResource(R.string.history_other)
}

@Composable
private fun day(date: LocalDate?): String =
    date?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.SHORT)) ?: stringResource(R.string.history_due_none)

@Composable
private fun meta(line: HistoryLine): String {
    val at = line.at?.let { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withZone(ZoneId.systemDefault()).format(it) }
    val source = when (line.source) {
        HistorySource.WEB -> stringResource(R.string.history_source_web)
        HistorySource.API -> stringResource(R.string.history_source_api)
        HistorySource.DEVICE -> stringResource(R.string.history_source_device)
        HistorySource.AI -> stringResource(R.string.history_source_ai)
        HistorySource.SUGGESTION -> stringResource(R.string.history_source_suggestion)
        HistorySource.IMPORT -> stringResource(R.string.history_source_import)
        null -> null
    }
    return when {
        at != null && source != null -> stringResource(R.string.history_when, at, source)
        else -> at ?: source.orEmpty()
    }
}
