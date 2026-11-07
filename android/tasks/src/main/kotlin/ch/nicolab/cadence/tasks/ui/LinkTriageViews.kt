package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.tasks.ui.autoclassify.AutoClassifyMarkLine

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkDecision
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkKind
import ch.nicolab.cadence.tasks.model.LinkLists
import ch.nicolab.cadence.tasks.model.LinkTriage
import ch.nicolab.cadence.tasks.model.ProjectChoices
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TriageProgress

/** Texte d'un champ de note qui s'enregistre sur « Terminé », en quittant le champ, et avant toute décision. */
internal class NoteDraft(initial: String, private val saved: () -> String?, private val save: (String?) -> Unit) {
    var text by mutableStateOf(initial)

    fun commit() {
        val value = text.trim()
        if (value != saved().orEmpty()) save(value.ifEmpty { null })
    }

    /** Le lien avec la note telle qu'elle est tapée : une décision ne doit pas lire une note d'avant la saisie. */
    fun applyTo(link: LinkItem): LinkItem = link.copy(note = text.trim().ifEmpty { null })
}

@Composable
internal fun rememberNoteDraft(link: LinkItem, onSave: (String?) -> Unit): NoteDraft {
    val current = rememberUpdatedState(link)
    val save = rememberUpdatedState(onSave)
    return remember(link.uid) { NoteDraft(link.note.orEmpty(), { current.value.note }, { save.value(it) }) }
}

private fun decisionLabel(decision: LinkDecision): Int = when (decision) {
    LinkDecision.KEEP -> R.string.links_action_kept
    LinkDecision.TASK -> R.string.links_action_task
    LinkDecision.TEST -> R.string.links_decision_test
    LinkDecision.ATTACH -> R.string.links_gallery_attach
    LinkDecision.LATER -> R.string.links_action_parked
    LinkDecision.DROP -> R.string.links_action_dropped
}

/**
 * Carte d'une idée qui contient un lien : ce qu'est la page, puis les décisions d'un toucher
 * (Garder, À tester, Rattacher s'il existe un projet ouvert, Plus tard, Jeter). Toucher la carte déplie le détail (début du README, note, étiquettes) ;
 * « Ouvrir » est un bouton à part. « Plus… » garde Aujourd'hui, Planifier et Projet pour en faire une tâche.
 * Glisser à droite garde le lien, à gauche le jette, avec « Annuler ».
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun LinkIdeaCard(
    entry: InboxEntry,
    link: LinkItem,
    viewModel: TasksViewModel,
    onToday: () -> Unit,
    onSchedule: () -> Unit,
    onProject: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    var expanded by rememberSaveable(entry.uid) { mutableStateOf(false) }
    var choosingProject by remember { mutableStateOf<LinkDecision?>(null) }
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val decisions = LinkTriage.inboxDecisions(hasProjects = ProjectChoices.forTask(projects, null).isNotEmpty())
    val draft = rememberNoteDraft(link) { viewModel.setLinkNote(link.uid, it) }
    val decide: (LinkDecision) -> Unit = { decision ->
        draft.commit()
        if (LinkTriage.needsProject(decision)) {
            choosingProject = decision
        } else {
            viewModel.decideLink(entry, draft.applyTo(link), decision)
        }
    }
    val latestDecide by rememberUpdatedState(decide)
    val keepLabel = stringResource(R.string.links_action_kept)
    val dropLabel = stringResource(R.string.links_action_dropped)
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { target ->
            when (target) {
                SwipeToDismissBoxValue.StartToEnd -> { latestDecide(LinkDecision.KEEP); true }
                SwipeToDismissBoxValue.EndToStart -> { latestDecide(LinkDecision.DROP); true }
                SwipeToDismissBoxValue.Settled -> false
            }
        },
    )
    SwipeToDismissBox(
        state = state,
        modifier = modifier.semantics {
            customActions = listOf(
                CustomAccessibilityAction(keepLabel) { decide(LinkDecision.KEEP); true },
                CustomAccessibilityAction(dropLabel) { decide(LinkDecision.DROP); true },
            )
        },
        backgroundContent = {
            val keeping = state.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            Box(
                Modifier
                    .fillMaxSize()
                    .clip(Radius.Card)
                    .background(if (keeping) palette.primaryContainer else palette.errorContainer)
                    .padding(horizontal = Space.xl),
                contentAlignment = if (keeping) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                Icon(
                    if (keeping) Icons.Outlined.Check else Icons.Outlined.Delete,
                    contentDescription = null,
                    tint = if (keeping) palette.onPrimaryContainer else palette.onErrorContainer,
                )
            }
        },
    ) {
        Column(
            Modifier.fillMaxWidth().clip(Radius.Card).background(palette.card).padding(Space.lg),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            if (LinkLists.showsText(entry.content, link)) {
                Text(
                    entry.content,
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.onSurface,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(verticalAlignment = Alignment.Top) {
                Column(
                    Modifier.weight(1f).clickable(role = Role.Button) { expanded = !expanded },
                    verticalArrangement = Arrangement.spacedBy(Space.xs),
                ) {
                    LinkSummary(link, descriptionLines = if (expanded) EXPANDED_LINES else 2)
                }
                OpenLinkButton(link.url)
            }
            if (!expanded && link.note != null) {
                Text(
                    link.note,
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.onSurface,
                    modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { expanded = true },
                )
            }
            AnimatedVisibility(expanded) {
                LinkDetails(link, tags, draft, onTags = { viewModel.setLinkTags(link.uid, it) })
            }
            DecisionPills(decisions = decisions, decide = decide) {
                MoreMenu(onToday = onToday, onSchedule = onSchedule, onProject = onProject)
            }
        }
    }
    choosingProject?.let { decision ->
        TestProjectSheet(
            viewModel = viewModel,
            onPick = { projectUid ->
                choosingProject = null
                viewModel.decideLink(entry, draft.applyTo(link), decision, projectUid)
            },
            onDismiss = { choosingProject = null },
            title = if (decision == LinkDecision.ATTACH) R.string.links_attach_project_title else R.string.links_test_project_title,
            allowNone = LinkTriage.allowsNoProject(decision),
        )
    }
}

private const val EXPANDED_LINES = 6

@Composable
private fun OpenLinkButton(url: String) {
    val uriHandler = LocalUriHandler.current
    IconButton(onClick = { runCatching { uriHandler.openUri(url) } }) {
        Icon(
            Icons.AutoMirrored.Outlined.OpenInNew,
            contentDescription = stringResource(R.string.links_open),
            tint = cadence.onSurfaceVariant,
        )
    }
}

/** Les décisions en pastilles calmes : Garder, À tester et Rattacher pleines, Plus tard et Jeter discrètes. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DecisionPills(decisions: List<LinkDecision>, decide: (LinkDecision) -> Unit, more: @Composable () -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        decisions.forEach { decision ->
            QuickPill(
                label = stringResource(decisionLabel(decision)),
                onClick = { decide(decision) },
                quiet = decision == LinkDecision.LATER || decision == LinkDecision.DROP,
            )
        }
        more()
    }
}

@Composable
private fun MoreMenu(onToday: () -> Unit, onSchedule: () -> Unit, onProject: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        QuickPill(stringResource(R.string.links_more), { open = true }, quiet = true)
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.tasks_idea_today)) }, onClick = { open = false; onToday() })
            DropdownMenuItem(text = { Text(stringResource(R.string.tasks_idea_schedule)) }, onClick = { open = false; onSchedule() })
            DropdownMenuItem(text = { Text(stringResource(R.string.tasks_idea_project)) }, onClick = { open = false; onProject() })
        }
    }
}

/** Début du README d'un dépôt, champ de note et étiquettes : ce qui aide à décider, caché tant qu'on ne déplie pas. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LinkDetails(link: LinkItem, tags: List<TagItem>, draft: NoteDraft, onTags: (List<String>) -> Unit) {
    val palette = cadence
    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
        if (link.kind == LinkKind.REPO && link.readmeExcerpt != null && link.readmeExcerpt != link.displayDescription) {
            Text(
                link.readmeExcerpt,
                style = MaterialTheme.typography.bodySmall,
                color = palette.outline,
                maxLines = README_LINES,
                overflow = TextOverflow.Ellipsis,
            )
        }
        NoteField(draft)
        LinkTagLine(link, tags, onTags)
        AutoClassifyMarkLine(entity = "link", uid = link.uid)
    }
}

private const val README_LINES = 8

@Composable
private fun NoteField(draft: NoteDraft) {
    val palette = cadence
    Box(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .heightIn(min = Size.touch)
            .padding(horizontal = Space.md, vertical = Space.md),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (draft.text.isEmpty()) {
            Text(stringResource(R.string.links_add_note), style = MaterialTheme.typography.bodyMedium, color = palette.outline)
        }
        BasicTextField(
            value = draft.text,
            onValueChange = { draft.text = it },
            textStyle = LocalTextStyle.current.merge(MaterialTheme.typography.bodyMedium).copy(color = palette.onSurface),
            cursorBrush = SolidColor(palette.primary),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { draft.commit() }),
            modifier = Modifier.fillMaxWidth().onFocusChanged { if (!it.isFocused) draft.commit() },
        )
    }
}

/** Étiquettes du lien et le bouton qui ouvre le choix ; sans étiquette, juste le bouton. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
internal fun LinkTagLine(link: LinkItem, tags: List<TagItem>, onTags: (List<String>) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    val chosen = remember(tags, link.tagUids) { tags.filter { it.uid in link.tagUids } }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        chosen.forEach { QuickPill(it.name, { picking = true }, quiet = true) }
        QuickPill(stringResource(if (chosen.isEmpty()) R.string.links_add_tag else R.string.links_edit_tags), { picking = true }, quiet = true)
    }
    if (picking) {
        CadenceSheet(title = stringResource(R.string.links_tags_title), subtitle = null, dismiss = { picking = false }) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.xl)) {
                if (tags.isEmpty()) {
                    Text(stringResource(R.string.links_no_tags), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
                } else {
                    TagChips(tags, link.tagUids.toSet()) { onTags(LinkTriage.toggleTag(link.tagUids, it)) }
                }
            }
        }
    }
}

/** « À tester » : dans quel projet ranger la tâche « Tester : … » (ou aucun). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TestProjectSheet(
    viewModel: TasksViewModel,
    onPick: (String?) -> Unit,
    onDismiss: () -> Unit,
    title: Int = R.string.links_test_project_title,
    allowNone: Boolean = true,
) {
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    CadenceSheet(title = stringResource(title), subtitle = null, dismiss = onDismiss) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = Space.xl)) {
            if (allowNone) ProjectRow(stringResource(R.string.tasks_no_project)) { onPick(null) }
            ProjectChoices.forTask(projects, null).forEach { project -> ProjectRow(project.name) { onPick(project.uid) } }
        }
    }
}

@Composable
private fun ProjectRow(name: String, onClick: () -> Unit) {
    Text(
        name,
        style = MaterialTheme.typography.bodyLarge,
        color = cadence.onSurface,
        modifier = Modifier.fillMaxWidth().heightIn(min = Size.touch).clickable(role = Role.Button, onClick = onClick).padding(vertical = Space.md),
    )
}

/** Bouton « Trier les liens (n) » en tête de l'Inbox, à partir de deux liens. */
@Composable
internal fun TriageEntry(count: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        QuickPill(pluralStringResource(R.plurals.links_triage_start, count, count), onClick)
    }
}

/**
 * Tri en série : un lien à la fois, pleine largeur, quatre décisions et « Passer ». La file est celle de l'Inbox
 * (plus ancien d'abord) : un lien décidé la quitte, un lien passé repart au bout, donc la reprise se fait
 * où on s'était arrêté. Les décisions se défont depuis la bannière « Annuler » comme dans la liste.
 */
@Composable
internal fun LinkTriageScreen(viewModel: TasksViewModel, onBack: () -> Unit) {
    val palette = cadence
    val entries by viewModel.inbox.collectAsStateWithLifecycle()
    val links by viewModel.links.collectAsStateWithLifecycle()
    val skipped by viewModel.skippedLinks.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val queue = remember(entries, links, skipped) { LinkTriage.queue(entries, links, skipped) }
    var startTotal by rememberSaveable { mutableIntStateOf(queue.size) }
    val progress = TriageProgress(maxOf(startTotal, queue.size), queue.size)
    BackHandler(onBack = onBack)

    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.links_triage_title),
                    subtitle = if (queue.isEmpty()) null else stringResource(R.string.links_triage_position, progress.position, progress.total),
                    onBack = onBack,
                    backDescription = stringResource(R.string.links_triage_close),
                )
            }
            val card = queue.firstOrNull()
            AnimatedContent(
                targetState = card?.entry?.uid,
                modifier = Modifier.weight(1f),
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "triage",
            ) { uid ->
                val current = queue.firstOrNull { it.entry.uid == uid } ?: card
                if (current == null) {
                    TriageDone(onBack)
                } else {
                    TriageCardPanel(
                        entry = current.entry,
                        link = current.link,
                        tags = tags,
                        viewModel = viewModel,
                        onSkip = { viewModel.skipLink(current.entry.uid) },
                        canSkip = queue.size > 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun TriageDone(onBack: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(Space.gutter),
        verticalArrangement = Arrangement.spacedBy(Space.lg, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.links_triage_done), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(stringResource(R.string.links_triage_done_hint), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        QuickPill(stringResource(R.string.links_triage_close), onBack)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TriageCardPanel(
    entry: InboxEntry,
    link: LinkItem,
    tags: List<TagItem>,
    viewModel: TasksViewModel,
    onSkip: () -> Unit,
    canSkip: Boolean,
) {
    val palette = cadence
    var choosingProject by remember(entry.uid) { mutableStateOf(false) }
    val draft = rememberNoteDraft(link) { viewModel.setLinkNote(link.uid, it) }
    val decide: (LinkDecision) -> Unit = { decision ->
        draft.commit()
        if (decision == LinkDecision.TEST) {
            choosingProject = true
        } else {
            viewModel.decideLink(entry, draft.applyTo(link), decision)
        }
    }
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            Column(
                Modifier.fillMaxWidth().clip(Radius.Card).background(palette.card).padding(Space.lg),
                verticalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                if (LinkLists.showsText(entry.content, link)) {
                    Text(entry.content, style = MaterialTheme.typography.bodyLarge, color = palette.onSurface)
                }
                Row(verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                        LinkSummary(link, descriptionLines = TRIAGE_DESCRIPTION_LINES)
                    }
                    OpenLinkButton(link.url)
                }
                LinkDetails(link, tags, draft, onTags = { viewModel.setLinkTags(link.uid, it) })
            }
        }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                TriageButton(LinkDecision.KEEP, decide, Modifier.weight(1f), quiet = false)
                TriageButton(LinkDecision.TEST, decide, Modifier.weight(1f), quiet = false)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                TriageButton(LinkDecision.LATER, decide, Modifier.weight(1f), quiet = true)
                TriageButton(LinkDecision.DROP, decide, Modifier.weight(1f), quiet = true)
            }
            if (canSkip) {
                TextButton(onClick = { draft.commit(); onSkip() }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Text(stringResource(R.string.links_triage_skip))
                }
            }
        }
    }
    if (choosingProject) {
        TestProjectSheet(
            viewModel = viewModel,
            onPick = { projectUid ->
                viewModel.decideLink(entry, draft.applyTo(link), LinkDecision.TEST, projectUid)
                choosingProject = false
            },
            onDismiss = { choosingProject = false },
        )
    }
}

private const val TRIAGE_DESCRIPTION_LINES = 10

@Composable
private fun TriageButton(decision: LinkDecision, decide: (LinkDecision) -> Unit, modifier: Modifier, quiet: Boolean) {
    QuickPill(stringResource(decisionLabel(decision)), { decide(decision) }, modifier = modifier, quiet = quiet, tall = true)
}
