package ch.nicolab.cadence.tasks.ui

import android.app.Application
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items as gridItems
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.outlined.GridView
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.tasks.model.LinkEdit
import ch.nicolab.cadence.tasks.model.ProjectChoices
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.LinkFilter
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkKind
import ch.nicolab.cadence.tasks.model.LinkLists
import ch.nicolab.cadence.tasks.model.LinkSource
import ch.nicolab.cadence.tasks.model.LinkStatus
import ch.nicolab.cadence.tasks.model.ShareText
import ch.nicolab.cadence.tasks.model.TagItem
import android.icu.text.CompactDecimalFormat
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private const val STOP_TIMEOUT_MS = 5_000L

/** Liens synchronisés, filtrés sur l'appareil ; la note et le statut partent par la file d'envoi. */
internal class LinksViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.repository(application)
    val filter = MutableStateFlow(LinkFilter())
    private val all = repository.observeLinks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    val total: StateFlow<Int> = all.map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), 0)

    val tagNames: StateFlow<Map<String, String>> = repository.observeTags().map { tags -> tags.associate { it.uid to it.name } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyMap())

    val shown: StateFlow<List<LinkItem>> =
        combine(all, repository.observeTags(), filter) { links, tags, current ->
            LinkLists.filter(links, current, tags.associate { it.uid to it.name })
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    fun setNote(uid: String, note: String?) = viewModelScope.launch { repository.setLinkNote(uid, note) }
    fun setTags(uid: String, tagUids: List<String>) = viewModelScope.launch { repository.setLinkTags(uid, tagUids) }

    /** Archiver garde le lien, caché par défaut ; désarchiver le rend « À voir ». */
    fun setArchived(uid: String, archived: Boolean) = viewModelScope.launch {
        repository.setLinkStatus(uid, if (archived) LinkStatus.DROPPED else LinkStatus.NEW)
    }

    /** Écrit seulement ce qui a changé : une adresse inchangée ne fait pas relire la page. */
    fun edit(link: LinkItem, edit: LinkEdit) = viewModelScope.launch {
        if (edit.title.trim() != link.title.orEmpty()) repository.setLinkTitle(link.uid, edit.title)
        if (edit.note.trim() != link.note.orEmpty()) repository.setLinkNote(link.uid, edit.note)
        if (edit.projectUid != link.projectUid) repository.setLinkProject(link.uid, edit.projectUid)
        repository.setLinkUrl(link.uid, edit.url, getApplication<Application>().getString(R.string.links_edit_url_call, link.displayTitle))
    }

    fun delete(uid: String) = viewModelScope.launch { repository.deleteLink(uid) }

    val tags: StateFlow<List<TagItem>> = repository.observeTags()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Étiquettes portées par au moins un lien : seules celles-là sont proposées en filtre. */
    val linkTags: StateFlow<List<TagItem>> = combine(all, tags) { links, known ->
        val used = links.flatMapTo(HashSet()) { it.tagUids }
        known.filter { it.uid in used }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

}

/**
 * Écran Liens, ouvert depuis l'Inbox : la bibliothèque de ce que l'utilisateur a gardé, lisible hors ligne, en liste
 * (galerie par thème à un appui), avec recherche et filtres par étiquette, projet et « Archivés ».
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LinksScreen(tasks: TasksViewModel, onBack: () -> Unit, onOpenSource: (LinkSource) -> Unit) {
    val viewModel: LinksViewModel = viewModel()
    val every by tasks.links.collectAsStateWithLifecycle()
    val links by viewModel.shown.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val layouts = remember(context) { LayoutStore(context) }
    var gallery by rememberSaveable { mutableStateOf(layouts.isOn(LayoutStore.LINKS)) }
    var taskFrom by remember { mutableStateOf<LinkItem?>(null) }
    val createTask: (LinkItem) -> Unit = { taskFrom = it }
    val projects by tasks.projects.collectAsStateWithLifecycle()
    var editingLink by remember { mutableStateOf<LinkItem?>(null) }
    var deleting by remember { mutableStateOf<LinkItem?>(null) }
    val total by viewModel.total.collectAsStateWithLifecycle()
    val filter by viewModel.filter.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val linkTags by viewModel.linkTags.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<LinkItem?>(null) }
    val tagNames by viewModel.tagNames.collectAsStateWithLifecycle()
    val themes = remember(links, tagNames) { LinkLists.byTheme(links, tagNames) }
    val palette = cadence
    BackHandler(onBack = onBack)

    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.links_title),
                    subtitle = pluralStringResource(R.plurals.links_count, total, total),
                    onBack = onBack,
                    backDescription = stringResource(R.string.links_back),
                    actions = {
                        RoundHeaderButton(
                            icon = if (gallery) Icons.AutoMirrored.Outlined.ViewList else Icons.Outlined.GridView,
                            contentDescription = stringResource(if (gallery) R.string.links_show_list else R.string.links_show_gallery),
                            onClick = {
                                gallery = !gallery
                                layouts.set(LayoutStore.LINKS, gallery)
                            },
                        )
                    },
                )
            }
            SearchPill(
                value = filter.query,
                onChange = { viewModel.filter.value = filter.copy(query = it) },
                modifier = Modifier.padding(horizontal = Space.gutter, vertical = Space.sm),
            )
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Space.gutter),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                ChoiceChip(
                    label = stringResource(R.string.links_filter_all_kinds),
                    selected = !filter.archived && filter.tagUid == null && filter.projectUid == null,
                    onClick = { viewModel.filter.value = filter.copy(archived = false, tagUid = null, projectUid = null) },
                )
                ChoiceChip(
                    label = stringResource(R.string.links_show_dropped),
                    selected = filter.archived,
                    onClick = { viewModel.filter.value = filter.copy(archived = !filter.archived) },
                )
            }
            if (linkTags.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Space.gutter),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                ) {
                    linkTags.forEach { tag ->
                        ChoiceChip(
                            label = tag.name,
                            selected = filter.tagUid == tag.uid,
                            onClick = { viewModel.filter.value = filter.copy(tagUid = if (filter.tagUid == tag.uid) null else tag.uid) },
                        )
                    }
                }
            }
            val linkProjects = remember(every, projects) {
                val used = every.mapNotNullTo(HashSet()) { it.projectUid }
                projects.filter { it.uid in used }
            }
            if (linkProjects.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Space.gutter),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                ) {
                    linkProjects.forEach { project ->
                        ChoiceChip(
                            label = project.name,
                            selected = filter.projectUid == project.uid,
                            onClick = {
                                viewModel.filter.value =
                                    filter.copy(projectUid = if (filter.projectUid == project.uid) null else project.uid)
                            },
                        )
                    }
                }
            }
            if (gallery) {
                LazyVerticalStaggeredGrid(
                    columns = StaggeredGridCells.Adaptive(Size.galleryCell),
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(start = Space.gutter, end = Space.gutter, top = Space.md, bottom = Space.xxxl),
                    horizontalArrangement = Arrangement.spacedBy(Space.sm),
                    verticalItemSpacing = Space.sm,
                ) {
                    if (links.isEmpty()) {
                        item(key = "empty", span = StaggeredGridItemSpan.FullLine) { LinksEmpty(total) }
                    }
                    themes.forEach { theme ->
                        if (themes.size > 1) {
                            item(key = "theme:${theme.name}", span = StaggeredGridItemSpan.FullLine) {
                                Text(
                                    theme.name ?: stringResource(R.string.links_no_theme),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = palette.onSurfaceVariant,
                                    modifier = Modifier.padding(top = Space.sm),
                                )
                            }
                        }
                        gridItems(theme.links, key = { it.uid }) { link ->
                            LinkGalleryCard(
                                link = link,
                                projectName = projects.firstOrNull { it.uid == link.projectUid }?.name,
                                onArchive = { viewModel.setArchived(link.uid, it) },
                                onEdit = { editingLink = link },
                                onTask = { createTask(link) },
                                onDelete = { deleting = link },
                            )
                        }
                    }
                }
            } else {
                LazyColumn(
                    Modifier.weight(1f),
                    contentPadding = PaddingValues(start = Space.gutter, end = Space.gutter, top = Space.md, bottom = Space.xxxl),
                    verticalArrangement = Arrangement.spacedBy(Space.sm),
                ) {
                    if (links.isEmpty()) {
                        item(key = "empty") { LinksEmpty(total) }
                    }
                    items(links, key = { it.uid }) { link ->
                        LinkCard(
                            link = link,
                            tags = tags,
                            onTags = { viewModel.setTags(link.uid, it) },
                            onEditNote = { editing = link },
                            onOpenSource = { link.source?.let(onOpenSource) },
                            projectName = projects.firstOrNull { it.uid == link.projectUid }?.name,
                            onArchive = { viewModel.setArchived(link.uid, it) },
                            onEdit = { editingLink = link },
                            onTask = { createTask(link) },
                            onDelete = { deleting = link },
                        )
                    }
                }
            }
        }
    }
    editingLink?.let { link ->
        LinkEditDialog(
            link = link,
            projects = ProjectChoices.forTask(projects, link.projectUid),
            tags = tags,
            onTags = { viewModel.setTags(link.uid, it) },
            onSave = {
                viewModel.edit(link, it)
                editingLink = null
            },
            onDismiss = { editingLink = null },
        )
    }
    deleting?.let { link ->
        LinkDeleteDialog(
            link = link,
            onConfirm = {
                viewModel.delete(link.uid)
                deleting = null
            },
            onDismiss = { deleting = null },
        )
    }
    taskFrom?.let { link ->
        QuickAddSheet(
            onDismiss = { taskFrom = null },
            initialName = link.displayTitle,
            initialNote = listOfNotNull(link.url, link.note?.takeIf { it.isNotBlank() }).joinToString("\n\n"),
            initialProjectUid = link.projectUid,
            initialTagUids = link.tagUids,
            expanded = true,
            onSave = { draft -> tasks.saveNewTask(draft) },
        )
    }
    editing?.let { link ->
        LinkNoteDialog(
            initial = link.note,
            onSave = { viewModel.setNote(link.uid, it); editing = null },
            onDismiss = { editing = null },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LinkCard(
    link: LinkItem,
    tags: List<TagItem>,
    onTags: (List<String>) -> Unit,
    onEditNote: () -> Unit,
    onOpenSource: () -> Unit,
    projectName: String?,
    onArchive: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onTask: () -> Unit,
    onDelete: () -> Unit,
) {
    val palette = cadence
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    Column(
        Modifier.fillMaxWidth().clip(Radius.Card).background(palette.card).padding(Space.lg),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Column(
            Modifier.fillMaxWidth().clickable(role = Role.Button) { runCatching { uriHandler.openUri(link.url) } },
            verticalArrangement = Arrangement.spacedBy(Space.xs),
        ) {
            LinkSummary(link, descriptionLines = 2)
        }
        if (link.kind == LinkKind.REPO && link.readmeExcerpt != null && link.readmeExcerpt != link.displayDescription) {
            Text(
                link.readmeExcerpt,
                style = MaterialTheme.typography.bodySmall,
                color = palette.outline,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (link.source != null) {
            TextButton(onClick = onOpenSource) { Text(stringResource(R.string.links_go_to_source)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            TextButton(onClick = { context.shareText(ShareText.link(link.title, link.url), link.displayTitle) }) {
                Text(stringResource(R.string.tasks_action_share))
            }
            TextButton(onClick = { context.copyText(link.displayTitle, ShareText.link(link.title, link.url)) }) {
                Text(stringResource(R.string.tasks_action_copy))
            }
        }
        LinkNoteLine(link.note, onEditNote)
        LinkTagLine(link, tags, onTags)
        projectName?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = palette.primary) }
        LinkControls(link, onArchive, onEdit, onTask, onDelete)
    }
}

/** Titre, description, domaine, type et chiffres GitHub : ce qu'est le lien, sans l'ouvrir. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LinkSummary(link: LinkItem, descriptionLines: Int) {
    val palette = cadence
    Text(
        link.displayTitle,
        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
        color = palette.onSurface,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
    link.displayDescription?.let {
        Text(
            it,
            style = MaterialTheme.typography.bodySmall,
            color = palette.onSurfaceVariant,
            maxLines = descriptionLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Text(link.domain, style = MaterialTheme.typography.labelSmall, color = palette.outline, maxLines = 1)
        if (link.kind != LinkKind.OTHER) {
            Text(stringResource(kindLabel(link.kind)), style = MaterialTheme.typography.labelSmall, color = palette.primary)
        }
        link.githubStars?.let { stars ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Star, contentDescription = null, tint = palette.outline, modifier = Modifier.size(Size.iconSm))
                Text(
                    starsText(stars),
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.outline,
                )
            }
        }
        link.githubLanguage?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = palette.outline) }
        link.githubLastCommit?.let { pushed ->
            val month = DateTimeFormatter.ofPattern("MMM yyyy", Locale.getDefault()).format(pushed.atZone(ZoneId.systemDefault()))
            Text(stringResource(R.string.links_last_commit, month), style = MaterialTheme.typography.labelSmall, color = palette.outline)
        }
        if (link.status == LinkStatus.DROPPED) {
            Text(stringResource(R.string.links_status_dropped), style = MaterialTheme.typography.labelSmall, color = palette.primary)
        }
        if (link.fetching) {
            Text(stringResource(R.string.links_fetching), style = MaterialTheme.typography.labelSmall, color = palette.outline)
        }
    }
}

/** La note de l'utilisateur sous le lien ; un toucher l'écrit ou la modifie. */
@Composable
internal fun LinkNoteLine(note: String?, onEdit: () -> Unit) {
    val palette = cadence
    Text(
        note ?: stringResource(R.string.links_add_note),
        style = MaterialTheme.typography.bodyMedium,
        color = if (note != null) palette.onSurface else palette.outline,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(role = Role.Button, onClick = onEdit)
            .padding(vertical = Space.sm),
    )
}

@Composable
internal fun LinkNoteDialog(initial: String?, onSave: (String?) -> Unit, onDismiss: () -> Unit) {
    var text by rememberSaveable { mutableStateOf(initial.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.links_note)) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = { Text(stringResource(R.string.links_note_placeholder)) },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(text.trim().ifEmpty { null }) }) { Text(stringResource(R.string.links_note_save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.tasks_cancel)) } },
    )
}

@Composable
private fun LinksEmpty(total: Int) {
    Text(
        stringResource(if (total == 0) R.string.links_empty else R.string.links_no_match),
        style = MaterialTheme.typography.bodyMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.padding(vertical = Space.lg),
    )
}

@Composable
private fun SearchPill(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    Row(
        modifier.fillMaxWidth().clip(Radius.Pill).background(palette.containerHigh).padding(horizontal = Space.lg, vertical = Space.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Icon(Icons.Outlined.Search, contentDescription = null, tint = palette.outline, modifier = Modifier.size(Size.iconSm))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(stringResource(R.string.links_search), style = MaterialTheme.typography.bodyLarge, color = palette.outline)
            }
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = LocalTextStyle.current.merge(MaterialTheme.typography.bodyLarge).copy(color = palette.onSurface),
                cursorBrush = SolidColor(palette.primary),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun kindLabel(kind: LinkKind): Int = when (kind) {
    LinkKind.REPO -> R.string.links_kind_repo
    LinkKind.ARTICLE -> R.string.links_kind_article
    LinkKind.VIDEO -> R.string.links_kind_video
    LinkKind.TOOL -> R.string.links_kind_tool
    LinkKind.OTHER -> R.string.links_kind_other
}

/** Nombre d'étoiles court (« 1,2 k »), dans la langue de l'appareil. */
internal fun starsText(stars: Int): String =
    CompactDecimalFormat.getInstance(Locale.getDefault(), CompactDecimalFormat.CompactStyle.SHORT).format(stars)
