@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import ch.nicolab.cadence.designsystem.components.CollapsingHeaderHost
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.annotation.StringRes
import ch.nicolab.cadence.designsystem.components.CadenceFab
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.TabPill
import ch.nicolab.cadence.designsystem.components.TabPills
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.SyncStatus
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

internal enum class TasksTab(@StringRes val label: Int) {
    TODAY(R.string.tasks_tab_today),
    UPCOMING(R.string.tasks_tab_upcoming),
    PROJECTS(R.string.tasks_tab_projects),
    TAGS(R.string.tasks_tab_tags),
    DONE(R.string.tasks_tab_done),
}

/**
 * Écran Tâches : titre et date, onglets à pastilles, tirer pour synchroniser, ajout rapide.
 * [openTaskUid] ouvre directement la fiche d'une tâche (depuis le widget ou un rappel).
 * [showProjectUid] ouvre directement le contenu d'un projet (depuis la recherche).
 * [routineStrip] est affiché dans l'onglet Aujourd'hui, sous les tâches du jour.
 */
@Composable
fun TasksScreen(
    modifier: Modifier = Modifier,
    openTaskUid: String? = null,
    showProjectUid: String? = null,
    onProjectShown: () -> Unit = {},
    onOpenSearch: () -> Unit = {},
    onOpenSettings: () -> Unit,
    routineStrip: @Composable () -> Unit = {},
) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    var tab by rememberSaveable { mutableStateOf(TasksTab.TODAY) }
    var openProjectUid by rememberSaveable { mutableStateOf(showProjectUid) }
    var openTagUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedTaskUid by rememberSaveable { mutableStateOf(openTaskUid) }
    var quickAddOpen by rememberSaveable { mutableStateOf(false) }
    val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val todayState by viewModel.today.collectAsStateWithLifecycle()
    val todayEvents by viewModel.todayEvents.collectAsStateWithLifecycle()
    val upcoming by viewModel.upcoming.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()

    LaunchedEffect(openTaskUid) {
        if (openTaskUid != null) selectedTaskUid = openTaskUid
    }
    LaunchedEffect(showProjectUid) {
        if (showProjectUid != null) {
            openProjectUid = showProjectUid
            onProjectShown()
        }
    }
    BackHandler(enabled = openProjectUid != null) { openProjectUid = null }
    BackHandler(enabled = openTagUid != null && openProjectUid == null) { openTagUid = null }

    val overdueCount = todayState.overdue.size
    val eventCount = todayEvents.size
    val dateLine = remember(moment.today) { formatHeaderDate(moment.today) }
    val subtitle = when {
        tab == TasksTab.UPCOMING -> stringResource(R.string.tasks_upcoming_subtitle)
        tab == TasksTab.PROJECTS -> pluralStringResource(R.plurals.tasks_projects_subtitle, projects.size, projects.size)
        tab == TasksTab.TAGS -> pluralStringResource(R.plurals.tasks_tags_subtitle, tags.size, tags.size)
        tab == TasksTab.DONE -> stringResource(R.string.tasks_done_subtitle)
        overdueCount > 0 -> "$dateLine · ${pluralStringResource(R.plurals.tasks_overdue_count, overdueCount, overdueCount)}"
        eventCount > 0 -> "$dateLine · ${pluralStringResource(R.plurals.tasks_events_count, eventCount, eventCount)}"
        else -> dateLine
    }

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { padding ->
        CollapsingHeaderHost(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.fillMaxSize()) {
                ScreenHeader(
                    title = stringResource(R.string.tasks_title),
                    subtitle = subtitle,
                    modifier = Modifier.statusBarsPadding().padding(horizontal = Space.gutter),
                    actions = {
                        RoundHeaderButton(
                            icon = Icons.Outlined.Search,
                            contentDescription = stringResource(R.string.tasks_search_open),
                            onClick = onOpenSearch,
                        )
                        RoundHeaderButton(
                            icon = Icons.Outlined.Settings,
                            contentDescription = stringResource(R.string.tasks_open_settings),
                            onClick = onOpenSettings,
                        )
                    },
                )
                if (openProjectUid == null) {
                    TabPills(
                        tabs = listOf(
                            TabPill(
                                stringResource(TasksTab.TODAY.label),
                                overdueCount + todayState.today.size + eventCount,
                            ),
                            TabPill(
                                stringResource(TasksTab.UPCOMING.label),
                                upcoming.values.sumOf { it.size },
                            ),
                            TabPill(stringResource(TasksTab.PROJECTS.label)),
                            TabPill(stringResource(TasksTab.TAGS.label)),
                            TabPill(stringResource(TasksTab.DONE.label)),
                        ),
                        selected = tab.ordinal,
                        onSelect = {
                            tab = TasksTab.entries[it]
                            openTagUid = null
                        },
                    )
                }
                SyncStatusLine(
                    status = syncStatus,
                    modifier = Modifier.padding(horizontal = Space.gutter, vertical = Space.xs),
                )
                PullToRefreshBox(
                    isRefreshing = syncStatus is SyncStatus.Syncing,
                    onRefresh = viewModel::requestSync,
                    modifier = Modifier.weight(1f),
                ) {
                    val projectUid = openProjectUid
                    when {
                        projectUid != null -> ProjectTasksPane(
                            viewModel = viewModel,
                            projectUid = projectUid,
                            onBack = { openProjectUid = null },
                            onOpen = { selectedTaskUid = it.uid },
                            modifier = Modifier.fillMaxSize(),
                        )
                        tab == TasksTab.TAGS && openTagUid != null -> TagTasksPane(
                            viewModel = viewModel,
                            tagUid = openTagUid.orEmpty(),
                            onBack = { openTagUid = null },
                            onOpen = { selectedTaskUid = it.uid },
                            modifier = Modifier.fillMaxSize(),
                        )
                        tab == TasksTab.TODAY -> TodayTab(
                            viewModel = viewModel,
                            snackbar = snackbar,
                            onOpen = { selectedTaskUid = it.uid },
                            modifier = Modifier.fillMaxSize(),
                            routineStrip = routineStrip,
                        )
                        tab == TasksTab.UPCOMING -> UpcomingTab(
                            viewModel = viewModel,
                            onOpen = { selectedTaskUid = it.uid },
                            modifier = Modifier.fillMaxSize(),
                        )
                        tab == TasksTab.PROJECTS -> ProjectsTab(
                            viewModel = viewModel,
                            onOpenProject = { openProjectUid = it },
                            modifier = Modifier.fillMaxSize(),
                        )
                        tab == TasksTab.TAGS -> TagsTab(
                            viewModel = viewModel,
                            onOpenTag = { openTagUid = it },
                            modifier = Modifier.fillMaxSize(),
                        )
                        else -> DoneTab(
                            viewModel = viewModel,
                            onOpen = { selectedTaskUid = it.uid },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
            CadenceFab(
                icon = Icons.Outlined.Add,
                contentDescription = stringResource(R.string.tasks_fab_add),
                onClick = { quickAddOpen = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = Space.gutter, bottom = navigationClearance() + Space.lg),
            )
        }
    }

    TaskOverlays(
        viewModel = viewModel,
        snackbar = snackbar,
        selectedTaskUid = selectedTaskUid,
        onCloseTask = { selectedTaskUid = null },
    )
    if (quickAddOpen) {
        QuickAddSheet(onDismiss = { quickAddOpen = false })
    }
}

/** Date du jour en court français, initiale en capitale : « Ven. 30 oct. ». */
private fun formatHeaderDate(date: LocalDate): String =
    DateTimeFormatter.ofPattern("EEE d MMM", Locale.FRENCH)
        .format(date)
        .replaceFirstChar { it.uppercaseChar() }
