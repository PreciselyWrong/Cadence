package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
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
                        keyboardActions = KeyboardActions(onSearch = { }),
                        modifier = Modifier.weight(1f).focusRequester(focus),
                    )
                }
                TabPills(
                    tabs = filters.map { TabPill(filterLabel(it), if (it == SearchFilter.ALL) allHits.size.takeIf { n -> n > 0 } else it.kind?.let(counts::get)) },
                    selected = filterIndex,
                    onSelect = { filterIndex = it },
                )
                when {
                    query.isBlank() -> Hint(stringResource(R.string.tasks_search_prompt))
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
                                        TaskRow(
                                            task = task,
                                            projectName = task.projectUid?.let(projectNames::get),
                                            today = moment.today,
                                            zone = moment.zone,
                                            onToggle = { viewModel.toggle(task) },
                                            onOpen = { selectedTaskUid = task.uid },
                                            onPostpone = { viewModel.postpone(task) },
                                            modifier = Modifier.padding(bottom = Space.xs),
                                        )
                                    }
                                }
                                SearchKind.PROJECT -> items(hits, key = { "project-${it.entry.id}" }) { hit ->
                                    val open = openByProject[hit.entry.id] ?: 0
                                    ResultRow(
                                        icon = Icons.Outlined.Folder,
                                        title = hit.entry.title,
                                        subtitle = pluralStringResource(R.plurals.tasks_open_count, open, open),
                                        onClick = { onOpenProject(hit.entry.id) },
                                    )
                                }
                                SearchKind.NOTE -> items(hits, key = { "note-${it.entry.id}" }) { hit ->
                                    val note = notesByUid[hit.entry.id]
                                    val updated = note?.updatedAt?.atZone(ZoneId.systemDefault())?.toLocalDate()?.format(resultDate)
                                    val tagLine = note?.tagUids?.mapNotNull(tagNames::get)?.joinToString(" ") { "#$it" }.orEmpty()
                                    ResultRow(
                                        icon = Icons.Outlined.Description,
                                        title = hit.entry.title.ifBlank { stringResource(R.string.tasks_note_untitled) },
                                        subtitle = listOfNotNull(updated?.let { stringResource(R.string.tasks_note_updated, it) }, tagLine.ifEmpty { null })
                                            .joinToString(" · ").ifEmpty { null },
                                        onClick = { selectedNoteUid = hit.entry.id },
                                    )
                                }
                                SearchKind.HABIT -> items(hits, key = { "habit-${it.entry.id}" }) { hit ->
                                    ResultRow(
                                        icon = Icons.Outlined.Hexagon,
                                        title = hit.entry.title,
                                        subtitle = stringResource(R.string.tasks_search_habit_subtitle),
                                        onClick = { onOpenHabit(hit.entry.id) },
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
    selectedNoteUid?.let { uid -> NoteScreen(viewModel, uid, onBack = { selectedNoteUid = null }) }
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

@Composable
private fun ResultRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String?, onClick: () -> Unit) {
    RowGroup(Modifier.fillMaxWidth().padding(bottom = Space.xs)) {
        SettingRow(title = title, subtitle = subtitle, icon = icon, onClick = onClick)
    }
}

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
