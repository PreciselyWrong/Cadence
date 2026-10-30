package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.clickable
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
    var scheduling by remember { mutableStateOf<InboxEntry?>(null) }
    var filing by remember { mutableStateOf<InboxEntry?>(null) }
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
            IdeaRow(
                modifier = Modifier.padding(bottom = Space.sm),
                entry = entry,
                previews = viewModel.linkPreviews,
                onOpen = { converting = entry },
                onToday = { viewModel.convertIdea(entry, TaskDraft(name = entry.content, dueDate = moment.today)) },
                onSchedule = { scheduling = entry },
                onProject = { filing = entry },
                onDelete = { viewModel.deleteIdeaWithUndo(entry.uid) },
            )
        }
        if (unsorted.isNotEmpty()) {
            item { SectionHeader(title = stringResource(R.string.tasks_section_unsorted)) }
            taskRows(unsorted, projectNames, projectColors, moment, viewModel, onOpen)
        }
    }

    scheduling?.let { entry ->
        TaskDatePickerDialog(
            initial = moment.today,
            onConfirm = { date ->
                viewModel.convertIdea(entry, TaskDraft(name = entry.content, dueDate = date))
                scheduling = null
            },
            onDismiss = { scheduling = null },
        )
    }
    filing?.let { entry ->
        IdeaProjectSheet(
            viewModel = viewModel,
            onPick = { projectUid ->
                viewModel.convertIdea(entry, TaskDraft(name = entry.content, projectUid = projectUid))
                filing = null
            },
            onDismiss = { filing = null },
        )
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

/**
 * Idée de la boîte : carte arrondie, texte (ou aperçu du lien quand l'idée n'est qu'un lien) et trois
 * actions en pastilles de texte. Glisser vers la gauche supprime, avec « Annuler » ; toucher le texte
 * ouvre l'ajout complet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IdeaRow(
    entry: InboxEntry,
    previews: LinkPreviews,
    onOpen: () -> Unit,
    onToday: () -> Unit,
    onSchedule: () -> Unit,
    onProject: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val deleteLabel = stringResource(R.string.tasks_idea_swipe_delete)
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { target ->
            if (target == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                true
            } else {
                false
            }
        },
    )
    SwipeToDismissBox(
        state = state,
        modifier = modifier.semantics { customActions = listOf(CustomAccessibilityAction(deleteLabel) { onDelete(); true }) },
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(
                Modifier.fillMaxSize().clip(Radius.Card).background(palette.errorContainer).padding(end = Space.xl),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Icon(Icons.Outlined.Delete, contentDescription = null, tint = palette.onErrorContainer)
            }
        },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(Radius.Card)
                .background(palette.card)
                .padding(Space.lg),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            Column(
                Modifier.fillMaxWidth().clickable(onClick = onOpen),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                if (!LinkExtractor.isOnlyLink(entry.content)) {
                    Text(
                        text = entry.content,
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.onSurface,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                LinkPreviewList(entry.content, previews, limit = 1)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                QuickPill(stringResource(R.string.tasks_idea_today), onToday)
                QuickPill(stringResource(R.string.tasks_idea_schedule), onSchedule)
                QuickPill(stringResource(R.string.tasks_idea_project), onProject)
            }
        }
    }
}

/** Action rapide en pastille de texte : le verbe est écrit, rien ne se lit comme « fait ». */
@Composable
private fun QuickPill(label: String, onClick: () -> Unit) {
    val palette = cadence
    Box(
        Modifier
            .heightIn(min = Size.tab)
            .clip(Radius.Pill)
            .background(palette.primaryContainer)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Space.lg),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = palette.onPrimaryContainer)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IdeaProjectSheet(viewModel: TasksViewModel, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    CadenceSheet(title = stringResource(R.string.tasks_idea_project_title), subtitle = null, dismiss = onDismiss) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.xl)) {
            projects.forEach { project ->
                Text(
                    project.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = cadence.onSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = Size.touch)
                        .clickable(role = Role.Button) { onPick(project.uid) }
                        .padding(vertical = Space.md),
                )
            }
        }
    }
}
