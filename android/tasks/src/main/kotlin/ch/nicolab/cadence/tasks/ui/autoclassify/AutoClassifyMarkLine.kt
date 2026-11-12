package ch.nicolab.cadence.tasks.ui.autoclassify

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.autoclassify.ClassifyMark
import ch.nicolab.cadence.tasks.sync.HttpError
import kotlinx.coroutines.launch

/**
 * « Classé automatiquement · Annuler » sur une tâche ou une note, quand le classement a posé une marque.
 * En ligne seulement : hors ligne, rien ne s'affiche. Annuler défait la marque, puis relit l'état.
 */
@Composable
fun AutoClassifyMarkLine(entity: String, uid: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.autoClassify(context) }
    val scope = rememberCoroutineScope()
    var marks by remember(entity, uid) { mutableStateOf<List<ClassifyMark>>(emptyList()) }
    var message by remember(entity, uid) { mutableStateOf<String?>(null) }
    var reload by remember(entity, uid) { mutableIntStateOf(0) }
    LaunchedEffect(entity, uid, reload) {
        marks = repository.marks(entity, uid).getOrNull().orEmpty()
    }
    val mark = marks.firstOrNull()
    if (mark == null && message == null) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        if (mark != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.auto_classify_marked),
                    style = MaterialTheme.typography.bodySmall,
                    color = cadence.onSurfaceVariant,
                )
                Spacer(Modifier.width(Space.sm))
                TertiaryAction(stringResource(R.string.auto_classify_undo)) {
                    scope.launch {
                        message = repository.undo(mark.changeId).fold(
                            onSuccess = { context.getString(R.string.auto_classify_undone) },
                            onFailure = { error ->
                                if ((error as? HttpError)?.code == CONFLICT) {
                                    context.getString(R.string.auto_classify_changed)
                                } else {
                                    error.message
                                }
                            },
                        )
                        reload++
                    }
                }
            }
        }
        message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant) }
    }
}

private const val CONFLICT = 409
