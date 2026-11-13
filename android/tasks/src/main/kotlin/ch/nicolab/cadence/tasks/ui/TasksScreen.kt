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
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import ch.nicolab.cadence.designsystem.components.CollapsingHeaderHost
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.ui.platform.LocalContext
import ch.nicolab.cadence.tasks.plugins.PluginActionButtons
import ch.nicolab.cadence.tasks.plugins.PluginPageActivity
import ch.nicolab.cadence.tasks.plugins.rememberPluginMenu
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
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.PinnedShortcut
import ch.nicolab.cadence.tasks.model.PinnedShortcuts
import ch.nicolab.cadence.tasks.model.SyncStatus
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

internal enum class TasksTab(@StringRes val label: Int) {
    TODAY(R.string.tasks_tab_today),
    UPCOMING(R.string.tasks_tab_upcoming),
    PROJECTS(R.string.tasks_tab_projects),
    TAGS(R.string.tasks_tab_tags),
    NOTES(R.string.tasks_tab_notes),
    DONE(R.string.tasks_tab_done),
}

/** Onglets que le filtre de domaine restreint ; les Notes n'ont pas de domaine. */
private val AREA_FILTER_TABS = setOf(TasksTab.TODAY, TasksTab.UPCOMING, TasksTab.PROJECTS, TasksTab.TAGS, TasksTab.DONE)

/**
 * Écran Tâches : titre et date, onglets à pastilles, tirer pour synchroniser, ajout rapide.
 * [openTaskUid] ouvre directement la fiche d'une tâche (widget ou rappel) ; [onTaskOpened] signale qu'elle est servie.
 * [showProjectUid] ouvre directement le contenu d'un projet (depuis la recherche).
 * [routineStrip] est affiché dans l'onglet Aujourd'hui, sous les tâches du jour.
 */
@Composable
fun TasksScreen(
    modifier: Modifier = Modifier,
    openTaskUid: String? = null,
    onTaskOpened: () -> Unit = {},
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
    var switcherOpen by rememberSaveable { mutableStateOf(false) }
    var selectedNoteUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedNoteIsNew by rememberSaveable { mutableStateOf(false) }
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    DeletionUndoEffect(viewModel, snackbar)
    val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val todayState by viewModel.today.collectAsStateWithLifecycle()
    val todayEvents by viewModel.todayEvents.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val areas by viewModel.areas.collectAsStateWithLifecycle()
    val areaFilter by viewModel.areaFilter.collectAsStateWithLifecycle()
    val withLink by viewModel.withLink.collectAsStateWithLifecycle()
    val planBoard by viewModel.planBoard.collectAsStateWithLifecycle()

    LaunchedEffect(openTaskUid) {
        if (openTaskUid != null) {
            selectedTaskUid = openTaskUid
            onTaskOpened()
        }
    }
    LaunchedEffect(showProjectUid) {
        if (showProjectUid != null) {
            openProjectUid = showProjectUid
            onProjectShown()
        }
    }
    BackHandler(enabled = openProjectUid != null) { openProjectUid = null }
    BackHandler(enabled = openTagUid != null && openProjectUid == null) { openTagUid = null }

    val context = LocalContext.current
    val layouts = remember(context) { LayoutStore(context) }
    var notesGallery by rememberSaveable { mutableStateOf(layouts.isOn(LayoutStore.NOTES)) }
    var hideDoneToday by rememberSaveable { mutableStateOf(layouts.isOn(LayoutStore.HIDE_DONE_TODAY)) }
    var hideDonePlan by rememberSaveable { mutableStateOf(layouts.isOn(LayoutStore.HIDE_DONE_PLAN)) }
    val overdueCount = todayState.overdue.size
    val eventCount = todayEvents.size
    val dateLine = remember(moment.today) { formatHeaderDate(moment.today) }
    // Menu des plugins : relu à chaque ouverture du sélecteur, et pour les boutons d'action de l'en-tête.
    val pluginMenu = rememberPluginMenu(switcherOpen)
    // Lieu et contexte des boutons d'action (docs/46-plugins.md) : projet ouvert, Aujourd'hui, Planifier.
    val pluginPlace = when {
        openProjectUid != null -> "project"
        tab == TasksTab.TODAY -> "today"
        tab == TasksTab.UPCOMING -> "plan"
        else -> null
    }
    val pluginContext: Map<String, String?> = when {
        openProjectUid != null -> mapOf("project" to openProjectUid)
        tab == TasksTab.TODAY -> mapOf("date" to moment.today.toString())
        tab == TasksTab.UPCOMING -> mapOf(
            "start" to planBoard.days.minOfOrNull { it.date }?.toString(),
            "end" to planBoard.days.maxOfOrNull { it.date }?.toString(),
        )
        else -> emptyMap()
    }
    val subtitle = when {
        tab == TasksTab.UPCOMING -> stringResource(R.string.tasks_upcoming_subtitle)
        tab == TasksTab.PROJECTS -> projectCounterLine(projects)
        tab == TasksTab.TAGS -> null
        // Pas de phrase d'explication sous le titre (comme le web, qui a retiré ses boutons « i »).
        tab == TasksTab.NOTES -> null
        tab == TasksTab.DONE -> null
        eventCount > 0 -> "$dateLine · ${pluralStringResource(R.plurals.tasks_events_count, eventCount, eventCount)}"
        else -> dateLine
    }

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { padding ->
        CollapsingHeaderHost(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.fillMaxSize()) {
                val areaName = areas.firstOrNull { it.uid == areaFilter }?.name?.takeIf { tab in AREA_FILTER_TABS }
                ScreenHeader(
                    // Le titre est la liste ouverte ; un appui ouvre le sélecteur (épinglés, listes, domaine).
                    title = stringResource(tab.label),
                    subtitle = listOfNotNull(subtitle, areaName).joinToString(" · ").ifEmpty { null },
                    modifier = Modifier.statusBarsPadding().padding(horizontal = Space.gutter),
                    onTitleClick = { switcherOpen = true },
                    titleClickLabel = stringResource(R.string.tasks_lists_open),
                    actions = {
                        pluginPlace?.let { place ->
                            PluginActionButtons(place = place, context = pluginContext, menu = pluginMenu)
                        }
                        if (tab == TasksTab.NOTES && openProjectUid == null) {
                            RoundHeaderButton(
                                icon = if (notesGallery) Icons.AutoMirrored.Outlined.ViewList else Icons.Outlined.GridView,
                                contentDescription = stringResource(if (notesGallery) R.string.links_show_list else R.string.links_show_gallery),
                                onClick = {
                                    notesGallery = !notesGallery
                                    layouts.set(LayoutStore.NOTES, notesGallery)
                                },
                            )
                        }
                        if ((tab == TasksTab.TODAY || tab == TasksTab.UPCOMING) && openProjectUid == null) {
                            val hidden = if (tab == TasksTab.TODAY) hideDoneToday else hideDonePlan
                            RoundHeaderButton(
                                icon = if (hidden) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = stringResource(if (hidden) R.string.plan_show_done else R.string.plan_hide_done),
                                onClick = {
                                    if (tab == TasksTab.TODAY) {
                                        hideDoneToday = !hideDoneToday
                                        layouts.set(LayoutStore.HIDE_DONE_TODAY, hideDoneToday)
                                    } else {
                                        hideDonePlan = !hideDonePlan
                                        layouts.set(LayoutStore.HIDE_DONE_PLAN, hideDonePlan)
                                    }
                                },
                            )
                        }
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
                            onOpenProject = { openProjectUid = it },
                            onOpen = { selectedTaskUid = it.uid },
                            onOpenNote = {
                                selectedNoteIsNew = false
                                selectedNoteUid = it.uid
                            },
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
                            onOpenPlan = { tab = TasksTab.UPCOMING },
                            hideDone = hideDoneToday,
                        )
                        tab == TasksTab.UPCOMING -> PlanTab(
                            viewModel = viewModel,
                            onOpen = { selectedTaskUid = it.uid },
                            hideDone = hideDonePlan,
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
                        tab == TasksTab.NOTES -> NotesTab(
                            viewModel = viewModel,
                            gallery = notesGallery,
                            onOpen = {
                                selectedNoteIsNew = false
                                selectedNoteUid = it.uid
                            },
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
                contentDescription = stringResource(
                    if (tab == TasksTab.NOTES) R.string.tasks_note_new else R.string.tasks_fab_add,
                ),
                onClick = {
                    if (tab == TasksTab.NOTES) {
                        selectedNoteIsNew = true
                        selectedNoteUid = UUID.randomUUID().toString()
                    } else {
                        quickAddOpen = true
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = Space.gutter, bottom = navigationClearance() + Space.lg),
            )
        }
    }

    if (switcherOpen) {
        val context = LocalContext.current
        ListSwitcherSheet(
            plugins = pluginMenu.items,
            onOpenPlugin = { item ->
                switcherOpen = false
                PluginPageActivity.start(context, item)
            },
            current = tab,
            todayCount = overdueCount + todayState.today.size + eventCount,
            pinned = remember(projects, notes) { PinnedShortcuts.of(projects, notes) },
            areas = areas,
            areaFilter = areaFilter,
            withLink = withLink,
            onSelectTab = {
                tab = it
                openTagUid = null
                openProjectUid = null
                switcherOpen = false
            },
            onOpenPinned = { shortcut ->
                switcherOpen = false
                when (shortcut.kind) {
                    PinnedShortcut.Kind.PROJECT -> {
                        tab = TasksTab.PROJECTS
                        openProjectUid = shortcut.uid
                    }
                    PinnedShortcut.Kind.NOTE -> {
                        selectedNoteIsNew = false
                        selectedNoteUid = shortcut.uid
                    }
                }
            },
            onUnpin = { shortcut ->
                when (shortcut.kind) {
                    PinnedShortcut.Kind.PROJECT -> viewModel.setProjectPinned(shortcut.uid, false)
                    PinnedShortcut.Kind.NOTE -> viewModel.saveNoteAttributes(shortcut.uid, NoteChange(pinned = false))
                }
            },
            onSelectArea = viewModel::selectArea,
            onSelectWithLink = viewModel::setWithLink,
            onOpenSettings = {
                switcherOpen = false
                onOpenSettings()
            },
            onDismiss = { switcherOpen = false },
        )
    }
    TaskOverlays(
        viewModel = viewModel,
        snackbar = snackbar,
        selectedTaskUid = selectedTaskUid,
        onCloseTask = { selectedTaskUid = null },
    )
    if (quickAddOpen) {
        QuickAddSheet(
            onDismiss = { quickAddOpen = false },
            targets = listOf(CaptureTarget.TASK, CaptureTarget.INBOX, CaptureTarget.NOTE),
            initialProjectUid = openProjectUid,
            onNoteCreated = {
                selectedNoteIsNew = false
                selectedNoteUid = it
            },
        )
    }
    selectedNoteUid?.let { uid ->
        NoteScreen(viewModel, uid, isNew = selectedNoteIsNew, onBack = { selectedNoteUid = null }, onOpenNote = { selectedNoteUid = it }, onOpenTask = { selectedTaskUid = it })
    }
}

/** Date du jour en court français, initiale en capitale : « Ven. 30 oct. ». */
private fun formatHeaderDate(date: LocalDate): String =
    DateTimeFormatter.ofPattern("EEE d MMM", Locale.FRENCH)
        .format(date)
        .replaceFirstChar { it.uppercaseChar() }
