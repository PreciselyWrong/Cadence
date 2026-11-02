package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import ch.nicolab.cadence.tasks.model.ProjectChoices
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkLists
import androidx.compose.ui.platform.LocalUriHandler
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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
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
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.TaskItem

private const val TRIAGE_MIN_LINKS = 2

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
    onTriage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val entries by viewModel.inbox.collectAsStateWithLifecycle()
    val links by viewModel.links.collectAsStateWithLifecycle()
    val unsorted by viewModel.unsorted.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    val projectIcons = rememberProjectIcons(viewModel)
    var capture by rememberSaveable { mutableStateOf("") }
    var converting by remember { mutableStateOf<InboxEntry?>(null) }
    var scheduling by remember { mutableStateOf<InboxEntry?>(null) }
    var filing by remember { mutableStateOf<InboxEntry?>(null) }
    var editing by remember { mutableStateOf<InboxEntry?>(null) }
    val submit = {
        val text = capture.trim()
        if (text.isNotEmpty()) {
            viewModel.captureInbox(text)
            capture = ""
        }
    }

    val linkCount = remember(entries, links) { entries.count { LinkLists.forEntry(links, it.uid, it.content) != null } }

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
        if (linkCount >= TRIAGE_MIN_LINKS) {
            item(key = "triage") { TriageEntry(linkCount, onTriage, Modifier.padding(bottom = Space.md)) }
        }
        items(entries, key = { it.uid }) { entry ->
            val link = remember(links, entry) { LinkLists.forEntry(links, entry.uid, entry.content) }
            val onToday = { viewModel.convertIdea(entry, TaskDraft(name = entry.content, dueDate = moment.today)) }
            if (link != null) {
                LinkIdeaCard(
                    entry = entry,
                    link = link,
                    viewModel = viewModel,
                    onToday = onToday,
                    onSchedule = { scheduling = entry },
                    onProject = { filing = entry },
                    modifier = Modifier.padding(bottom = Space.sm),
                )
            } else {
                IdeaRow(
                    modifier = Modifier.padding(bottom = Space.sm),
                    entry = entry,
                    previews = viewModel.linkPreviews,
                    onOpen = { converting = entry },
                    onToday = onToday,
                    onSchedule = { scheduling = entry },
                    onProject = { filing = entry },
                    onNote = { viewModel.convertIdeaToNote(entry) },
                    onEdit = { editing = entry },
                    onDelete = { viewModel.deleteIdeaWithUndo(entry.uid) },
                )
            }
        }
        if (unsorted.isNotEmpty()) {
            item { SectionHeader(title = stringResource(R.string.tasks_section_unsorted)) }
            taskRows(unsorted, projectNames, projectColors, moment, viewModel, onOpen, projectIcons = projectIcons)
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
    editing?.let { entry ->
        IdeaTextDialog(
            initial = entry.content,
            onSave = { text ->
                viewModel.renameIdea(entry.uid, text)
                editing = null
            },
            onDismiss = { editing = null },
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
 * Idée de la boîte sans lien enregistré : carte arrondie, texte (avec l'aperçu d'un lien pas encore lu par
 * le serveur) et trois actions en pastilles de texte. Une idée au lien enregistré est une [LinkIdeaCard]. Glisser vers la gauche supprime, avec « Annuler » ; toucher le texte
 * ouvre l'ajout complet.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun IdeaRow(
    entry: InboxEntry,
    previews: LinkPreviews,
    onOpen: () -> Unit,
    onToday: () -> Unit,
    onSchedule: () -> Unit,
    onProject: () -> Unit,
    onNote: () -> Unit,
    onEdit: () -> Unit,
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
                // Trois lignes au repos ; « Afficher tout » déplie une idée longue sans quitter la liste.
                var expanded by rememberSaveable(entry.uid) { mutableStateOf(false) }
                var overflows by remember(entry.content) { mutableStateOf(false) }
                Text(
                    text = entry.content,
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.onSurface,
                    maxLines = if (expanded) Int.MAX_VALUE else IDEA_COLLAPSED_LINES,
                    overflow = TextOverflow.Ellipsis,
                    onTextLayout = { if (!expanded) overflows = it.hasVisualOverflow },
                )
                if (overflows || expanded) {
                    Text(
                        stringResource(if (expanded) R.string.tasks_idea_show_less else R.string.tasks_idea_show_more),
                        style = MaterialTheme.typography.labelLarge,
                        color = readableTintOf(palette.primary, palette.card),
                        modifier = Modifier
                            .clip(Radius.Pill)
                            .clickable { expanded = !expanded }
                            .padding(vertical = Space.xs),
                    )
                }
                LinkPreviewList(entry.content, previews, limit = 1)
            }
            // Passe à la ligne plutôt que de rogner une pastille en grande police.
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                QuickPill(stringResource(R.string.tasks_idea_today), onToday)
                QuickPill(stringResource(R.string.tasks_idea_schedule), onSchedule)
                QuickPill(stringResource(R.string.tasks_idea_project), onProject)
                QuickPill(stringResource(R.string.tasks_idea_note), onNote)
                QuickPill(stringResource(R.string.tasks_idea_edit), onEdit, quiet = true)
            }
        }
    }
}

@Composable
private fun IdeaTextDialog(initial: String, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var text by rememberSaveable { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.tasks_idea_edit_title)) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(text.trim()) },
                enabled = text.isNotBlank(),
            ) { Text(stringResource(R.string.tasks_idea_edit_save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.tasks_cancel)) } },
    )
}

/**
 * Action rapide en pastille de texte : le verbe est écrit, rien ne se lit comme « fait ». [quiet] grise la
 * pastille pour les gestes secondaires ; [tall] l'agrandit pour le tri en série.
 */
@Composable
internal fun QuickPill(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    quiet: Boolean = false,
    tall: Boolean = false,
) {
    val palette = cadence
    Box(
        modifier
            .heightIn(min = if (tall) Size.control else Size.tab)
            .clip(Radius.Pill)
            .background(if (quiet) palette.containerHigh else palette.primaryContainer)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Space.lg),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (quiet) palette.onSurfaceVariant else palette.onPrimaryContainer,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IdeaProjectSheet(viewModel: TasksViewModel, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    CadenceSheet(title = stringResource(R.string.tasks_idea_project_title), subtitle = null, dismiss = onDismiss) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.xl)) {
            ProjectChoices.forTask(projects, null).forEach { project ->
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

private const val IDEA_COLLAPSED_LINES = 3
