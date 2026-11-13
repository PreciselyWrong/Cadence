package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.model.FunnelStage
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkLists
import ch.nicolab.cadence.tasks.model.ProjectChoices
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.quickadd.ShareCapture

/** L'idée à trier et le titre de sa page s'il est connu à l'appui. */
private data class IdeaChoice(val entry: InboxEntry, val pageTitle: String?)

/**
 * Une idée de l'Inbox, dans Planifier : sa rangée de décisions et les feuilles qu'elles ouvrent (choix du projet,
 * conversion en tâche, modification). [onPlan] ouvre « Planifier » de l'écran, qui la porte à un jour ou un horizon.
 * Chaque décision s'écrit tout de suite ; « Annuler » sur l'écran écrit l'inverse.
 */
@Composable
internal fun IdeaItem(
    entry: InboxEntry,
    viewModel: TasksViewModel,
    onPlan: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val links by viewModel.links.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val verbs = ShareCapture.verbs(LocalContext.current)
    var converting by remember { mutableStateOf<IdeaChoice?>(null) }
    var linking by remember { mutableStateOf<IdeaChoice?>(null) }
    var editing by remember { mutableStateOf(false) }
    // Une page déjà enregistrée dans les liens donne son titre ; sinon celui de l'aperçu lu par le serveur.
    val saved = remember(links, entry) { LinkLists.forEntry(links, entry.content)?.title }
    IdeaRow(
        entry = entry,
        previews = viewModel.linkPreviews,
        savedTitle = saved,
        onTask = { title ->
            if (IdeaTasks.isOnlyAddress(entry.content)) {
                viewModel.saveLinkIdeaAsTask(entry, title)
            } else {
                converting = IdeaChoice(entry, title)
            }
        },
        onProject = { title -> linking = IdeaChoice(entry, title) },
        onNote = { viewModel.convertIdeaToNote(entry) },
        onPlan = onPlan,
        onEdit = { editing = true },
        onDelete = { viewModel.deleteIdeaWithUndo(entry.uid) },
        modifier = modifier,
    )
    if (editing) {
        IdeaTextDialog(
            initial = entry.content,
            onSave = { text ->
                viewModel.renameIdea(entry.uid, text)
                editing = false
            },
            onDismiss = { editing = false },
        )
    }
    converting?.let { choice ->
        QuickAddSheet(
            onDismiss = { converting = null },
            initialName = IdeaTasks.taskName(choice.entry.content, choice.pageTitle, verbs),
            initialNote = IdeaTasks.taskNote(choice.entry.content),
            expanded = true,
            onSave = { draft -> viewModel.saveConversion(choice.entry, draft) },
        )
    }
    linking?.let { choice ->
        LinkProjectSheet(
            projects = ProjectChoices.forTask(projects, null),
            onPick = { projectUid ->
                viewModel.saveIdeaToPage(choice.entry, choice.pageTitle, projectUid)
                linking = null
            },
            onDismiss = { linking = null },
        )
    }
}

/**
 * Une idée : carte arrondie, texte (caché quand il n'est qu'une adresse), aperçu de la page s'il y en a une, puis la
 * rangée de décisions : Tâche, Projet (avec une adresse), Note, et « … » (Planifier, Modifier, Supprimer).
 * Glisser vers la gauche supprime, avec « Annuler » ; toucher le texte ouvre la tâche pré-remplie.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun IdeaRow(
    entry: InboxEntry,
    previews: LinkPreviews,
    savedTitle: String?,
    onTask: (String?) -> Unit,
    onProject: (String?) -> Unit,
    onNote: () -> Unit,
    onPlan: () -> Unit,
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
                if (url != null) QuickPill(stringResource(R.string.tasks_idea_to_project), onClick = { onProject(pageTitle) })
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
                            R.string.plan_sheet_title to onPlan,
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

private const val IDEA_COLLAPSED_LINES = 3

/**
 * « Quand ? » sous une tâche classée sans moment choisi. Chaque choix passe par le ViewModel, donc part en file hors
 * ligne ; la tâche sort de la liste dès qu'un moment est posé.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun WhenChoices(task: TaskItem, viewModel: TasksViewModel) {
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
