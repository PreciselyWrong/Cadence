package ch.nicolab.cadence.tasks.ui

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import ch.nicolab.cadence.tasks.notes.ContentRef
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.contentlinks.Backlink
import kotlinx.coroutines.CancellationException

/**
 * « Rétroliens » en bas d'une note ou d'une fiche de tâche ([type] `note` ou `task`) : lus en ligne à l'ouverture,
 * montrés seulement s'il y en a (hors ligne : rien). Toucher une ligne ouvre la note ou la tâche.
 */
@Composable
internal fun BacklinksSection(type: String, uid: String, onOpen: (Backlink) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val links by produceState(emptyList<Backlink>(), type, uid) {
        value = try {
            TasksGraph.backlinks(context).of(type, uid)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            emptyList()
        }
    }
    if (links.isEmpty()) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(stringResource(R.string.backlinks_title), style = MaterialTheme.typography.titleSmall, color = cadence.onSurfaceVariant)
        links.forEach { link ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = Size.touch)
                    .clickable(role = Role.Button) { onOpen(link) }
                    .padding(vertical = Space.xs),
            ) {
                Text(
                    stringResource(if (link.type == "note") R.string.backlinks_note else R.string.backlinks_task, link.title),
                    style = MaterialTheme.typography.bodyLarge,
                    color = cadence.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                link.snippet?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/**
 * Ouvre la cible d'un lien interne : une note par uid, une tâche par uid ou par nom (`[[task:Nom]]`, cherchée sur
 * l'appareil, sinon un message). Une personne n'a pas de fiche sur Android.
 */
@Composable
internal fun rememberContentRefOpener(
    viewModel: TasksViewModel,
    onOpenNote: (String) -> Unit,
    onOpenTask: (String) -> Unit,
): (ContentRef) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    return remember(viewModel, onOpenNote, onOpenTask) {
        { ref ->
            when (ref) {
                is ContentRef.Note -> onOpenNote(ref.uid)
                is ContentRef.Person -> Unit
                is ContentRef.Task -> when {
                    ref.uid != null -> onOpenTask(ref.uid)
                    ref.name != null -> scope.launch {
                        val task = viewModel.taskNamed(ref.name)
                        if (task != null) onOpenTask(task.uid)
                        else Toast.makeText(context, context.getString(R.string.content_task_not_found, ref.name), Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }
}
