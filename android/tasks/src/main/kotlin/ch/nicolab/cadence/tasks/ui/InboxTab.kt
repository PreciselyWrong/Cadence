package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkLists
import ch.nicolab.cadence.tasks.model.ProjectChoices
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.ui.triage.TriageEntry

/**
 * Capture rapide : le champ en tête envoie la saisie à la boîte de réception. Chaque idée, lien ou non, se trie d'une
 * seule rangée : Tâche (saisie pré-remplie, projet et étiquettes visibles), Liens (idée qui porte une adresse), Note ;
 * glisser à gauche supprime. Une décision s'écrit tout de suite, « Annuler » écrit l'inverse.
 * Sous les entrées, « Tâches à classer » liste les tâches sans échéance, qu'aucun autre onglet n'affiche : sans projet
 * ni domaine, ou classées mais sans quand choisi (« Quand ? » sous la ligne : cette semaine, une date, plus tard, sans date).
 * Quand la file « À trier » attend, une entrée « À trier (N) » s'affiche au-dessus de la saisie.
 */
@Composable
internal fun InboxTab(
    viewModel: TasksViewModel,
    captureFocus: FocusRequester,
    onOpen: (TaskItem) -> Unit,
    triageCount: Int = 0,
    onOpenTriage: () -> Unit = {},
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
    var converting by remember { mutableStateOf<IdeaChoice?>(null) }
    var linking by remember { mutableStateOf<IdeaChoice?>(null) }
    var editing by remember { mutableStateOf<InboxEntry?>(null) }
    val submit = {
        val text = capture.trim()
        if (text.isNotEmpty()) {
            viewModel.captureInbox(text)
            capture = ""
        }
    }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (triageCount > 0) {
            item(key = "triage") { TriageEntry(triageCount, onOpen = onOpenTriage) }
        }
        item(key = "capture") {
            CaptureField(
                value = capture,
                onValueChange = { capture = it },
                onSubmit = submit,
                modifier = Modifier.padding(bottom = Space.md).focusRequester(captureFocus),
            )
        }
        // L'Inbox vide ne se dit que si rien n'attend non plus dans « Tâches à classer ».
        if (entries.isEmpty() && unsorted.isEmpty()) {
            item { EmptyState(R.string.tasks_inbox_empty) }
        }
        items(entries, key = { it.uid }) { entry ->
            // Une page déjà enregistrée dans les liens donne son titre ; sinon celui de l'aperçu lu par le serveur.
            val saved = remember(links, entry) { LinkLists.forEntry(links, entry.uid, entry.content)?.title }
            IdeaRow(
                modifier = Modifier.padding(bottom = Space.sm),
                entry = entry,
                previews = viewModel.linkPreviews,
                savedTitle = saved,
                onTask = { title -> converting = IdeaChoice(entry, title) },
                onLinks = { title -> linking = IdeaChoice(entry, title) },
                onNote = { viewModel.convertIdeaToNote(entry) },
                onEdit = { editing = entry },
                onDelete = { viewModel.deleteIdeaWithUndo(entry.uid) },
            )
        }
        if (unsorted.isNotEmpty()) {
            item { SectionHeader(title = stringResource(R.string.tasks_section_unsorted)) }
            taskRows(
                unsorted,
                projectNames,
                projectColors,
                moment,
                viewModel,
                onOpen,
                projectIcons = projectIcons,
                belowRow = { task -> if (task.needsWhen) WhenChoices(task, viewModel) },
            )
        }
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
    converting?.let { choice ->
        QuickAddSheet(
            onDismiss = { converting = null },
            initialName = IdeaTasks.taskName(choice.entry.content, choice.pageTitle),
            initialNote = IdeaTasks.taskNote(choice.entry.content),
            expanded = true,
            onSave = { draft -> viewModel.saveConversion(choice.entry, draft) },
        )
    }
    linking?.let { choice ->
        IdeaLinkSheet(
            viewModel = viewModel,
            url = IdeaTasks.address(choice.entry.content) ?: return@let,
            onSave = { tagUids, projectUid ->
                viewModel.saveIdeaToLinks(choice.entry, choice.pageTitle, tagUids, projectUid)
                linking = null
            },
            onDismiss = { linking = null },
        )
    }
}

/**
 * « Quand ? » sous une tâche classée sans moment choisi. Chaque choix passe par le ViewModel, donc part en file hors
 * ligne ; la tâche sort de la liste dès qu'un moment est posé.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WhenChoices(task: TaskItem, viewModel: TasksViewModel) {
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    var picking by remember(task.uid) { mutableStateOf(false) }
    FlowRow(
        Modifier.fillMaxWidth().padding(start = Space.lg, end = Space.lg, bottom = Space.sm),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Text(
            stringResource(R.string.tasks_when_label),
            style = MaterialTheme.typography.labelLarge,
            color = cadence.onSurfaceVariant,
            modifier = Modifier.padding(end = Space.xs),
        )
        QuickPill(stringResource(R.string.funnel_this_week), onClick = { viewModel.funnel(task, FunnelStage.THIS_WEEK) }, quiet = true)
        QuickPill(stringResource(R.string.tasks_when_pick_date), onClick = { picking = true }, quiet = true)
        QuickPill(stringResource(R.string.funnel_later), onClick = { viewModel.funnel(task, FunnelStage.LATER) }, quiet = true)
        QuickPill(stringResource(R.string.tasks_no_due_date), onClick = { viewModel.clearWhen(task) }, quiet = true)
    }
    if (picking) {
        TaskDatePickerDialog(
            initial = moment.today,
            onConfirm = { picking = false; viewModel.reschedule(task, it) },
            onDismiss = { picking = false },
        )
    }
}

/** L'idée à trier et le titre de sa page s'il est connu à l'appui. */
private data class IdeaChoice(val entry: InboxEntry, val pageTitle: String?)

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
 * Une idée de la boîte : carte arrondie, texte (caché quand il n'est qu'une adresse), aperçu de la page s'il y en a
 * une, puis la rangée de décisions : Tâche, Liens (avec une adresse), Note, et « … » (Modifier, Supprimer).
 * Glisser vers la gauche supprime, avec « Annuler » ; toucher le texte ouvre la tâche pré-remplie.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun IdeaRow(
    entry: InboxEntry,
    previews: LinkPreviews,
    savedTitle: String?,
    onTask: (String?) -> Unit,
    onLinks: (String?) -> Unit,
    onNote: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val url = remember(entry.content) { IdeaTasks.address(entry.content) }
    val pageTitle = savedTitle ?: rememberPageTitle(url, previews)
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
                Modifier.fillMaxWidth().clickable { onTask(pageTitle) },
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                if (url == null || !LinkExtractor.isOnlyLink(entry.content)) {
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
                }
                LinkPreviewList(entry.content, previews, limit = 1)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalAlignment = Alignment.CenterVertically) {
                QuickPill(stringResource(R.string.tasks_idea_to_task), onClick = { onTask(pageTitle) })
                if (url != null) QuickPill(stringResource(R.string.tasks_idea_to_links), onClick = { onLinks(pageTitle) })
                QuickPill(stringResource(R.string.tasks_idea_note), onNote, quiet = true)
                var menu by remember { mutableStateOf(false) }
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(
                            Icons.Outlined.MoreHoriz,
                            contentDescription = stringResource(R.string.tasks_idea_more),
                            tint = palette.onSurfaceVariant,
                        )
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        listOf(
                            R.string.tasks_idea_edit to onEdit,
                            R.string.tasks_idea_delete to onDelete,
                        ).forEach { (label, action) ->
                            DropdownMenuItem(
                                text = { Text(stringResource(label)) },
                                onClick = {
                                    menu = false
                                    action()
                                },
                            )
                        }
                    }
                }
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

/** « Liens » sur une idée : l'aperçu, le projet et les étiquettes du lien, puis Enregistrer. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IdeaLinkSheet(
    viewModel: TasksViewModel,
    url: String,
    onSave: (List<String>, String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    var tagUids by remember { mutableStateOf(emptyList<String>()) }
    var projectUid by remember { mutableStateOf<String?>(null) }
    CadenceSheet(title = stringResource(R.string.tasks_idea_links_title), subtitle = null, dismiss = onDismiss) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            LinkPreviewCard(url, viewModel.linkPreviews)
            ProjectAndTagFields(
                projects = ProjectChoices.forTask(projects, null),
                projectUid = projectUid,
                onProject = { projectUid = it },
                tags = tags,
                tagUids = tagUids,
                onTag = { uid -> tagUids = if (uid in tagUids) tagUids - uid else tagUids + uid },
            )
            Row(Modifier.fillMaxWidth()) {
                Spacer(Modifier.weight(1f))
                PrimaryAction(stringResource(R.string.links_save)) { onSave(tagUids, projectUid) }
            }
        }
    }
}

private const val IDEA_COLLAPSED_LINES = 3
