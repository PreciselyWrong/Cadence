package ch.nicolab.cadence.tasks.ui

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.project.inactiveDays
import ch.nicolab.cadence.tasks.review.DormantProject
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Projets ouverts sans activité depuis 30 jours. La liste vient du serveur ; hors ligne, la dernière lecture
 * reste affichée. « Garder » retire la ligne tout de suite (appel de revue, gardé hors ligne au besoin).
 */
internal class DormantProjectsViewModel(application: Application) : AndroidViewModel(application) {
    private val review = TasksGraph.review(application)
    private val genericError = application.getString(R.string.tasks_error_generic)
    private val _projects = MutableStateFlow<List<DormantProject>>(emptyList())
    val projects: StateFlow<List<DormantProject>> = _projects.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    fun refresh() {
        viewModelScope.launch {
            try {
                review.dormantProjects().onSuccess { _projects.value = it.value }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _messages.tryEmit(error.message ?: genericError)
            }
        }
    }

    fun keep(project: DormantProject) {
        _projects.update { list -> list.filterNot { it.uid == project.uid } }
        viewModelScope.launch {
            try {
                review.keepProject(project.uid, project.name).onFailure { error ->
                    _projects.update { list -> list + project }
                    _messages.tryEmit(error.message ?: genericError)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _projects.update { list -> list + project }
                _messages.tryEmit(error.message ?: genericError)
            }
        }
    }
}

/**
 * Section repliée en bas de la liste des projets. Toucher la ligne ouvre le projet ; « Garder » la retire.
 */
internal fun LazyListScope.dormantProjectItems(
    projects: List<DormantProject>,
    today: LocalDate,
    zone: ZoneId,
    expanded: Boolean,
    onToggle: () -> Unit,
    onOpen: (String) -> Unit,
    onKeep: (DormantProject) -> Unit,
) {
    if (projects.isEmpty()) return
    item(key = "dormant-header") {
        DormantHeader(count = projects.size, expanded = expanded, onToggle = onToggle)
    }
    if (expanded) {
        itemsIndexed(projects, key = { _, project -> "dormant-${project.uid}" }) { index, project ->
            DormantProjectRow(
                project = project,
                today = today,
                zone = zone,
                first = index == 0,
                last = index == projects.lastIndex,
                onOpen = { onOpen(project.uid) },
                onKeep = { onKeep(project) },
            )
        }
    }
}

@Composable
private fun DormantHeader(count: Int, expanded: Boolean, onToggle: () -> Unit) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(onClick = onToggle)
            .padding(horizontal = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.projects_dormant_header, count),
            style = MaterialTheme.typography.titleSmall,
            color = palette.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Icon(
            if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight,
            contentDescription = null,
            tint = palette.onSurfaceVariant,
        )
    }
}

@Composable
private fun DormantProjectRow(
    project: DormantProject,
    today: LocalDate,
    zone: ZoneId,
    first: Boolean,
    last: Boolean,
    onOpen: () -> Unit,
    onKeep: () -> Unit,
) {
    val palette = cadence
    val activity = project.lastActivityAt
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(onClick = onOpen)
            .padding(vertical = Space.sm, horizontal = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(project.name, style = MaterialTheme.typography.bodyLarge, color = palette.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (activity != null) {
                val days = inactiveDays(activity, today, zone)
                Text(
                    pluralStringResource(R.plurals.projects_dormant_last_activity, days, days),
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.width(Space.xs))
        TextButton(onClick = onKeep) { Text(stringResource(R.string.projects_dormant_keep)) }
    }
}
