package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.History
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.search.RecentSearchStore
import ch.nicolab.cadence.tasks.search.RecentSearches
import ch.nicolab.cadence.tasks.search.SearchHighlight
import ch.nicolab.cadence.tasks.search.Snippet
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Hexagon
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.TabPill
import ch.nicolab.cadence.designsystem.components.TabPills
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.search.SearchEngine
import ch.nicolab.cadence.tasks.search.SearchEntry
import ch.nicolab.cadence.tasks.search.SearchFilter
import ch.nicolab.cadence.tasks.search.SearchKind
import ch.nicolab.cadence.tasks.search.SearchSources
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Recherche globale : tâches, projets, notes et, via [habits], les habitudes de l'application.
 * Une tâche et une note s'ouvrent ici même ; un projet ou une habitude rendent la main à l'appelant.
 */
@Composable
fun SearchScreen(
    habits: List<SearchEntry>,
    onBack: () -> Unit,
    onOpenProject: (String) -> Unit,
    onOpenHabit: (String) -> Unit,
) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    val focus = remember { FocusRequester() }
    val context = LocalContext.current
    val recentStore = remember { RecentSearchStore(context) }
    var recents by remember { mutableStateOf(recentStore.load()) }
    var query by rememberSaveable { mutableStateOf("") }
    var filterIndex by rememberSaveable { mutableIntStateOf(0) }
    var selectedTaskUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedNoteUid by rememberSaveable { mutableStateOf<String?>(null) }
    val tasks by viewModel.everyTask.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val filters = SearchFilter.entries
    val filter = filters[filterIndex.coerceIn(0, filters.lastIndex)]

    val projectNames = remember(projects) { projects.associate { it.uid to it.name } }
    val tagNames = remember(tags) { tags.associate { it.uid to it.name } }
    val entries = remember(tasks, projects, notes, habits, projectNames, tagNames) {
        SearchSources.tasks(tasks, projectNames, tagNames) +
            SearchSources.projects(projects) +
            SearchSources.notes(notes, tagNames) +
            habits
    }
    val allHits = remember(entries, query) { SearchEngine.search(entries, query, SearchFilter.ALL) }
    val counts = remember(allHits) { SearchEngine.counts(allHits) }
    val shown = remember(allHits, filter) { allHits.filter { filter.kind == null || it.entry.kind == filter.kind } }
    val grouped = remember(shown) { shown.groupBy { it.entry.kind } }
    val tasksByUid = remember(tasks) { tasks.associateBy { it.uid } }
    val openByProject = remember(tasks) {
        tasks.filter { !it.isClosed && it.projectUid != null }.groupingBy { it.projectUid }.eachCount()
    }
    val notesByUid = remember(notes) { notes.associateBy { it.uid } }

    val suggestions = remember(projects, tags, openByProject, tasks) { searchSuggestions(projects, tags, tasks, openByProject) }
    // Une recherche compte comme faite quand elle mène quelque part : un résultat ouvert ou la touche Rechercher.
    val keepQuery = {
        recents = RecentSearches.add(recents, query)
        recentStore.save(recents)
    }

    LaunchedEffect(Unit) { focus.requestFocus() }
    BackHandler(enabled = selectedNoteUid == null, onBack = onBack)

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RoundHeaderButton(
                        icon = Icons.AutoMirrored.Outlined.ArrowBack,
                        contentDescription = stringResource(R.string.tasks_search_back),
                        style = HeaderButtonStyle.Plain,
                        onClick = onBack,
                    )
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text(stringResource(R.string.tasks_search_hint)) },
                        leadingIcon = { Icon(Icons.Outlined.Search, null, tint = cadence.onSurfaceVariant) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = "" }) {
                                    Icon(Icons.Outlined.Close, stringResource(R.string.tasks_search_clear))
                                }
                            }
                        },
                        singleLine = true,
                        shape = Radius.Pill,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { keepQuery() }),
                        modifier = Modifier.weight(1f).focusRequester(focus),
                    )
                }
                TabPills(
                    tabs = filters.map { TabPill(filterLabel(it), if (it == SearchFilter.ALL) allHits.size.takeIf { n -> n > 0 } else it.kind?.let(counts::get)) },
                    selected = filterIndex,
                    onSelect = { filterIndex = it },
                )
                when {
                    query.isBlank() -> SearchStart(
                        recents = recents,
                        suggestions = suggestions,
                        onPick = { query = it },
                        onRemove = {
                            recents = RecentSearches.remove(recents, it)
                            recentStore.save(recents)
                        },
                        onClear = {
                            recents = emptyList()
                            recentStore.save(recents)
                        },
                    )
                    shown.isEmpty() -> Hint(stringResource(R.string.tasks_search_empty, query.trim()))
                    else -> LazyColumn(
                        Modifier.weight(1f),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(
                            start = Space.gutter,
                            end = Space.gutter,
                            bottom = navigationClearance(),
                        ),
                    ) {
                        listOf(SearchKind.TASK, SearchKind.PROJECT, SearchKind.NOTE, SearchKind.HABIT).forEach { kind ->
                            val hits = grouped[kind].orEmpty()
                            if (hits.isEmpty()) return@forEach
                            item(key = "header-$kind") {
                                SectionHeader(title = kindTitle(kind), count = hits.size)
                            }
                            when (kind) {
                                SearchKind.TASK -> items(hits, key = { "task-${it.entry.id}" }) { hit ->
                                    tasksByUid[hit.entry.id]?.let { task ->
                                        val snippet = remember(hit.entry.detail, query) { SearchHighlight.snippet(hit.entry.detail, query, SNIPPET_CHARS) }
                                        Column(Modifier.padding(bottom = Space.xs)) {
                                            TaskRow(
                                                task = task,
                                                projectName = task.projectUid?.let(projectNames::get),
                                                today = moment.today,
                                                zone = moment.zone,
                                                onToggle = { viewModel.toggle(task, hold = true) },
                                                onOpen = { keepQuery(); selectedTaskUid = task.uid },
                                                onSwipeAction = { viewModel.swipe(task, it) },
                                                onMenu = { viewModel.openMenu(task) },
                                            )
                                            snippet?.let { MatchLine(it, Modifier.padding(horizontal = Space.lg, vertical = Space.xs)) }
                                        }
                                    }
                                }
                                SearchKind.PROJECT -> items(hits, key = { "project-${it.entry.id}" }) { hit ->
                                    val open = openByProject[hit.entry.id] ?: 0
                                    ResultRow(
                                        icon = Icons.Outlined.Folder,
                                        title = highlighted(hit.entry.title, SearchHighlight.ranges(hit.entry.title, query)),
                                        subtitle = AnnotatedString(pluralStringResource(R.plurals.tasks_open_count, open, open)),
                                        onClick = { keepQuery(); onOpenProject(hit.entry.id) },
                                    )
                                }
                                SearchKind.NOTE -> items(hits, key = { "note-${it.entry.id}" }) { hit ->
                                    val note = notesByUid[hit.entry.id]
                                    val updated = note?.updatedAt?.atZone(ZoneId.systemDefault())?.toLocalDate()?.format(resultDate)
                                    val tagLine = note?.tagUids?.mapNotNull(tagNames::get)?.joinToString(" ") { "#$it" }.orEmpty()
                                    val title = hit.entry.title.ifBlank { stringResource(R.string.tasks_note_untitled) }
                                    val snippet = remember(hit.entry.detail, query) { SearchHighlight.snippet(hit.entry.detail, query, SNIPPET_CHARS) }
                                    val meta = listOfNotNull(updated?.let { stringResource(R.string.tasks_note_updated, it) }, tagLine.ifEmpty { null })
                                        .joinToString(" · ").ifEmpty { null }
                                    ResultRow(
                                        icon = Icons.Outlined.Description,
                                        title = highlighted(title, SearchHighlight.ranges(title, query)),
                                        subtitle = snippet?.let { highlighted(it.text, it.ranges) } ?: meta?.let(::AnnotatedString),
                                        onClick = { keepQuery(); selectedNoteUid = hit.entry.id },
                                    )
                                }
                                SearchKind.HABIT -> items(hits, key = { "habit-${it.entry.id}" }) { hit ->
                                    ResultRow(
                                        icon = Icons.Outlined.Hexagon,
                                        title = highlighted(hit.entry.title, SearchHighlight.ranges(hit.entry.title, query)),
                                        subtitle = AnnotatedString(stringResource(R.string.tasks_search_habit_subtitle)),
                                        onClick = { keepQuery(); onOpenHabit(hit.entry.id) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    TaskOverlays(
        viewModel = viewModel,
        snackbar = snackbar,
        selectedTaskUid = selectedTaskUid,
        onCloseTask = { selectedTaskUid = null },
    )
    selectedNoteUid?.let { uid -> NoteScreen(viewModel, uid, isNew = false, onBack = { selectedNoteUid = null }) }
}

@Composable
private fun filterLabel(filter: SearchFilter): String = stringResource(
    when (filter) {
        SearchFilter.ALL -> R.string.tasks_search_all
        SearchFilter.TASKS -> R.string.tasks_search_tasks
        SearchFilter.NOTES -> R.string.tasks_search_notes
        SearchFilter.PROJECTS -> R.string.tasks_search_projects
        SearchFilter.HABITS -> R.string.tasks_search_habits
    },
)

@Composable
private fun kindTitle(kind: SearchKind): String = stringResource(
    when (kind) {
        SearchKind.TASK -> R.string.tasks_search_tasks
        SearchKind.PROJECT -> R.string.tasks_search_projects
        SearchKind.NOTE -> R.string.tasks_search_notes
        SearchKind.HABIT -> R.string.tasks_search_habits
    },
)

/** Ligne de résultat : titre et contexte sur une ligne chacun, mots cherchés en évidence. */
@Composable
private fun ResultRow(icon: ImageVector, title: AnnotatedString, subtitle: AnnotatedString?, onClick: () -> Unit) {
    val palette = cadence
    Panel(Modifier.padding(bottom = Space.xs), onClick = onClick) {
        Row(Modifier.fillMaxWidth().heightIn(min = Size.touch), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = palette.primary, modifier = Modifier.size(Size.iconLarge))
            Spacer(Modifier.width(Space.lg))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge, color = palette.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                subtitle?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
        }
    }
}

/** Contexte d'une correspondance trouvée hors du titre, sur une seule ligne. */
@Composable
private fun MatchLine(snippet: Snippet, modifier: Modifier = Modifier) {
    Text(
        highlighted(snippet.text, snippet.ranges),
        modifier,
        style = MaterialTheme.typography.bodySmall,
        color = cadence.onSurfaceVariant,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun highlighted(text: String, ranges: List<IntRange>): AnnotatedString {
    val accent = cadence.primary
    return remember(text, ranges, accent) {
        buildAnnotatedString {
            append(text)
            ranges.forEach { addStyle(SpanStyle(color = accent, fontWeight = FontWeight.SemiBold), it.first, it.last + 1) }
        }
    }
}

/**
 * Écran de départ, avant toute saisie : recherches récentes (retirables, effaçables) puis
 * suggestions tirées des projets et étiquettes les plus utilisés.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SearchStart(
    recents: List<String>,
    suggestions: List<String>,
    onPick: (String) -> Unit,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
) {
    val palette = cadence
    if (recents.isEmpty() && suggestions.isEmpty()) {
        Hint(stringResource(R.string.tasks_search_prompt))
        return
    }
    LazyColumn(
        Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = Space.gutter, end = Space.gutter, bottom = navigationClearance()),
    ) {
        if (recents.isNotEmpty()) {
            item(key = "recent-header") {
                SectionHeader(
                    title = stringResource(R.string.tasks_search_recent),
                    actionLabel = stringResource(R.string.tasks_search_recent_clear),
                    onAction = onClear,
                )
            }
            items(recents, key = { "recent-$it" }) { recent ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = Size.touch).clip(Radius.Control).clickable(role = Role.Button) { onPick(recent) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.History, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
                    Spacer(Modifier.width(Space.md))
                    Text(recent, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = palette.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val removeLabel = stringResource(R.string.tasks_search_recent_remove, recent)
                    IconButton(onClick = { onRemove(recent) }, modifier = Modifier.semantics { contentDescription = removeLabel }) {
                        Icon(Icons.Outlined.Close, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.iconSm))
                    }
                }
            }
        }
        if (suggestions.isNotEmpty()) {
            item(key = "suggestions") {
                Column {
                    SectionHeader(title = stringResource(R.string.tasks_search_suggestions))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                        suggestions.forEach { ChoiceChip(it, selected = false) { onPick(it) } }
                    }
                }
            }
        }
    }
}

/** Projets les plus chargés puis étiquettes les plus employées : ce qu'on cherche le plus souvent. */
private fun searchSuggestions(
    projects: List<ProjectItem>,
    tags: List<TagItem>,
    tasks: List<TaskItem>,
    openByProject: Map<String?, Int>,
): List<String> {
    val tagUse = tasks.filter { !it.isClosed }.flatMap { it.tagUids }.groupingBy { it }.eachCount()
    val topProjects = projects.filter { (openByProject[it.uid] ?: 0) > 0 }.sortedByDescending { openByProject[it.uid] ?: 0 }.take(SUGGESTIONS_PER_KIND)
    val topTags = tags.filter { (tagUse[it.uid] ?: 0) > 0 }.sortedByDescending { tagUse[it.uid] ?: 0 }.take(SUGGESTIONS_PER_KIND)
    return (topProjects.map { it.name } + topTags.map { it.name }).distinct()
}

private const val SNIPPET_CHARS = 64
private const val SUGGESTIONS_PER_KIND = 3

@Composable
private fun Hint(message: String) {
    Text(
        message,
        style = MaterialTheme.typography.bodyLarge,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(Space.xl),
    )
}

private val resultDate: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)
