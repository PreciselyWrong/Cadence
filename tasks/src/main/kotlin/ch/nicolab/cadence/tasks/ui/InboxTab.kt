package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.TaskItem

/**
 * Capture rapide : le champ en tête envoie la saisie à la boîte de réception.
 * « Convertir en tâche » ouvre l'ajout rapide pré-rempli, puis supprime l'entrée.
 * Sous les entrées, « Tâches à classer » liste les tâches sans échéance ni projet,
 * qu'aucun autre onglet n'affiche.
 */
@Composable
internal fun InboxTab(
    viewModel: TasksViewModel,
    captureFocus: FocusRequester,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val entries by viewModel.inbox.collectAsStateWithLifecycle()
    val unsorted by viewModel.unsorted.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    var capture by rememberSaveable { mutableStateOf("") }
    var converting by remember { mutableStateOf<InboxEntry?>(null) }
    val submit = {
        val text = capture.trim()
        if (text.isNotEmpty()) {
            viewModel.captureInbox(text)
            capture = ""
        }
    }

    LazyColumn(modifier = modifier, contentPadding = TasksListPadding) {
        item(key = "capture") {
            OutlinedTextField(
                value = capture,
                onValueChange = { capture = it },
                placeholder = { Text(stringResource(R.string.tasks_inbox_capture_hint)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth().focusRequester(captureFocus),
            )
        }
        if (entries.isEmpty()) {
            item { EmptyState(R.string.tasks_inbox_empty) }
        }
        items(entries, key = { it.uid }) { entry ->
            InboxRow(
                entry = entry,
                onConvert = { converting = entry },
                onDelete = { viewModel.deleteInboxItem(entry.uid) },
            )
        }
        if (unsorted.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.tasks_section_unsorted)) }
            taskRows(unsorted, projectNames, moment, viewModel, onOpen)
        }
    }

    converting?.let { entry ->
        QuickAddSheet(
            onDismiss = { converting = null },
            initialName = entry.content,
            onSave = { draft -> viewModel.saveConversion(entry, draft) },
        )
    }
}

@Composable
private fun InboxRow(entry: InboxEntry, onConvert: () -> Unit, onDelete: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(
            text = entry.content,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onConvert) { Text(stringResource(R.string.tasks_inbox_convert)) }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onDelete) {
                Icon(Icons.Outlined.Delete, contentDescription = stringResource(R.string.tasks_action_delete))
            }
        }
    }
}
