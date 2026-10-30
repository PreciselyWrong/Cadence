package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
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
    val projectColors = rememberProjectColors(viewModel)
    var capture by rememberSaveable { mutableStateOf("") }
    var converting by remember { mutableStateOf<InboxEntry?>(null) }
    val submit = {
        val text = capture.trim()
        if (text.isNotEmpty()) {
            viewModel.captureInbox(text)
            capture = ""
        }
    }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        item(key = "capture") {
            CaptureField(
                value = capture,
                onValueChange = { capture = it },
                onSubmit = submit,
                modifier = Modifier.padding(bottom = Space.md).focusRequester(captureFocus),
            )
        }
        if (entries.isEmpty()) {
            item { EmptyState(R.string.tasks_inbox_empty) }
        }
        items(entries, key = { it.uid }) { entry ->
            InboxRow(
                modifier = Modifier.padding(bottom = Space.sm),
                entry = entry,
                onConvert = { converting = entry },
                onDelete = { viewModel.deleteInboxItem(entry.uid) },
            )
        }
        if (unsorted.isNotEmpty()) {
            item { SectionHeader(title = stringResource(R.string.tasks_section_unsorted)) }
            taskRows(unsorted, projectNames, projectColors, moment, viewModel, onOpen)
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

/** Champ de capture rempli et arrondi, avec un bouton d'envoi rond : le clavier valide aussi. */
@Composable
private fun CaptureField(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    Row(
        modifier
            .fillMaxWidth()
            .clip(Radius.Pill)
            .background(palette.containerHigh)
            .padding(start = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(
                    text = stringResource(R.string.tasks_inbox_capture_hint),
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.outline,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = LocalTextStyle.current.merge(MaterialTheme.typography.bodyLarge).copy(color = palette.onSurface),
                cursorBrush = SolidColor(palette.primary),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSubmit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        RoundHeaderButton(
            icon = Icons.AutoMirrored.Outlined.Send,
            contentDescription = stringResource(R.string.tasks_inbox_capture_send),
            style = if (value.isBlank()) HeaderButtonStyle.Plain else HeaderButtonStyle.Filled,
            onClick = onSubmit,
        )
    }
}

/** Entrée de la boîte : carte arrondie, titre sur deux lignes au plus, actions icône de 48 dp. */
@Composable
private fun InboxRow(entry: InboxEntry, onConvert: () -> Unit, onDelete: () -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    Row(
        modifier
            .fillMaxWidth()
            .clip(Radius.Card)
            .background(palette.card)
            .heightIn(min = Size.settingRow)
            .padding(start = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        Text(
            text = entry.content,
            style = MaterialTheme.typography.bodyLarge,
            color = palette.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(vertical = Space.md),
        )
        IconButton(onClick = onConvert, modifier = Modifier.size(Size.touch)) {
            Icon(
                Icons.Outlined.TaskAlt,
                contentDescription = stringResource(R.string.tasks_inbox_convert),
                tint = palette.primary,
            )
        }
        IconButton(onClick = onDelete, modifier = Modifier.size(Size.touch)) {
            Icon(
                Icons.Outlined.Delete,
                contentDescription = stringResource(R.string.tasks_action_delete),
                tint = palette.onSurfaceVariant,
            )
        }
    }
}
