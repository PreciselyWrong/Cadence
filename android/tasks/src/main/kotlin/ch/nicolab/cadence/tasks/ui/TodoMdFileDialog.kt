package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TodoMdFile
import ch.nicolab.cadence.tasks.model.TodoMdFiles
import kotlinx.coroutines.launch

/**
 * Les fichiers proposés au projet, lus en ligne. Null hors ligne, pour un autre compte, ou sans fichier : le menu
 * n'offre alors rien, comme le web. Un projet tiré d'un dépôt git n'y figure pas : son fichier vient de la configuration.
 */
@Composable
internal fun rememberTodoMdFiles(projectUid: String): MutableState<List<TodoMdFile>?> {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.todoMd(context) }
    val files = remember(projectUid) { mutableStateOf<List<TodoMdFile>?>(null) }
    LaunchedEffect(projectUid) {
        files.value = client.files().getOrNull()?.takeIf { it.isNotEmpty() }
    }
    return files
}

@Composable
internal fun TodoMdFileDialog(
    projectUid: String,
    files: MutableState<List<TodoMdFile>?>,
    onChanged: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val client = remember(context) { TasksGraph.todoMd(context) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val list = files.value.orEmpty()
    val current = TodoMdFiles.currentFolder(list, projectUid)

    val choose: (String?) -> Unit = { folder ->
        if (!busy && folder != current) {
            busy = true
            failed = false
            scope.launch {
                val done = runCatching {
                    if (current != null) client.unlink(projectUid).getOrThrow()
                    if (folder != null) client.link(projectUid, folder).getOrThrow()
                }
                failed = done.isFailure
                client.files().getOrNull()?.let { files.value = it }
                busy = false
                onChanged()
            }
        }
    }

    @Composable
    fun Choice(label: String, detail: String?, folder: String?, enabled: Boolean) {
        Row(
            Modifier
                .fillMaxWidth()
                .selectable(selected = folder == current, enabled = enabled && !busy, role = Role.RadioButton, onClick = { choose(folder) }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RadioButton(selected = folder == current, onClick = null, enabled = enabled && !busy)
            Column(Modifier.padding(start = Space.xs)) {
                Text(label, style = MaterialTheme.typography.bodyMedium)
                if (detail != null) {
                    Text(detail, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.todo_md_file_title)) },
        text = {
            Column(
                Modifier.selectableGroup().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                Text(stringResource(R.string.todo_md_file_hint), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                Choice(stringResource(R.string.todo_md_file_none), null, null, true)
                list.forEach { file ->
                    val free = TodoMdFiles.selectable(file, projectUid)
                    Choice(
                        file.path,
                        if (free) null else stringResource(R.string.todo_md_file_taken, file.projectName.orEmpty()),
                        file.folder,
                        free,
                    )
                }
                if (failed) {
                    Text(stringResource(R.string.todo_md_file_failed), style = MaterialTheme.typography.bodySmall, color = cadence.error)
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.todo_md_file_close)) } },
    )
}
