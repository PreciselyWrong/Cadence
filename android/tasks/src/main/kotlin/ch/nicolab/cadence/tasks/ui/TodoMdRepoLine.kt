package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TodoMdLine
import ch.nicolab.cadence.tasks.model.TodoMdRepo
import ch.nicolab.cadence.tasks.model.TodoMdRepos
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val REFRESH_MS = 30_000L

/**
 * Sous le titre d'un projet tiré d'un dépôt git : « Synchronisé avec … · il y a 3 min », ou le conflit et les
 * modifications en attente avec « Réessayer » et « Abandonner », comme le web. Lu en ligne toutes les 30 s ;
 * hors ligne, pour un autre compte ou pour un projet qui n'est pas un dépôt, rien ne s'affiche.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TodoMdRepoLine(projectUid: String, onChanged: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.todoMd(context) }
    val scope = rememberCoroutineScope()
    var repo by remember(projectUid) { mutableStateOf<TodoMdRepo?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(projectUid) {
        while (true) {
            repo = client.status().getOrNull()?.let { TodoMdRepos.forProject(it, projectUid) }
            delay(REFRESH_MS)
        }
    }
    val current = repo ?: return
    val line = TodoMdRepos.line(current)
    val palette = cadence
    val color = when (line) {
        is TodoMdLine.Conflict, is TodoMdLine.Pending -> readableTintOf(palette.warning, palette.background)
        is TodoMdLine.Error -> palette.error
        else -> palette.onSurfaceVariant
    }
    val act: (suspend () -> Result<TodoMdRepo?>) -> Unit = { action ->
        if (!busy) {
            busy = true
            scope.launch {
                action().onSuccess { updated -> if (updated != null) repo = updated }
                    .onFailure { repo = client.status().getOrNull()?.let { TodoMdRepos.forProject(it, projectUid) } }
                busy = false
                onChanged()
            }
        }
    }
    FlowRow(
        modifier.fillMaxWidth().semantics { if (line.needsAction) liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Text(TodoMdRepos.text(line, Instant.now(), ZoneId.systemDefault()), style = MaterialTheme.typography.bodySmall, color = color)
        if (line.needsAction) {
            TextButton(onClick = { act { client.retry(current.slug) } }, enabled = !busy) { Text(stringResource(R.string.todo_md_retry)) }
            TextButton(onClick = { act { client.discard(current.slug) } }, enabled = !busy) { Text(stringResource(R.string.todo_md_discard)) }
        }
    }
}
