@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalContext
import ch.nicolab.cadence.tasks.planning.PlanTrayRequest
import ch.nicolab.cadence.tasks.plugins.PluginActionButtons
import ch.nicolab.cadence.tasks.proposals.ProposalKind
import ch.nicolab.cadence.tasks.ui.proposals.rememberProposalAction
import ch.nicolab.cadence.tasks.plugins.PluginPageActivity
import ch.nicolab.cadence.tasks.plugins.rememberPluginMenu
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.annotation.StringRes
import ch.nicolab.cadence.designsystem.components.PrimaryAdd
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.PinnedShortcut
import ch.nicolab.cadence.tasks.model.PinnedShortcuts
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.views.SavedView
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
    onOpenNotifications: () -> Unit = {},
    routineStrip: @Composable () -> Unit = {},
    showPlan: Boolean = false,
    onPlanShown: () -> Unit = {},
) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    var tab by rememberSaveable { mutableStateOf(TasksTab.TODAY) }
    var openProjectUid by rememberSaveable { mutableStateOf(showProjectUid) }
    var openTagUid by rememberSaveable { mutableStateOf<String?>(null) }
    var openViewUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedTaskUid by rememberSaveable { mutableStateOf(openTaskUid) }
    var quickAddOpen by rememberSaveable { mutableStateOf(false) }
    var projectAddChooserOpen by rememberSaveable { mutableStateOf(false) }
    var templatesPickerOpen by rememberSaveable { mutableStateOf(false) }
    var switcherOpen by rememberSaveable { mutableStateOf(false) }
    var selectedNoteUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedNoteIsNew by rememberSaveable { mutableStateOf(false) }
    var selectedNoteProjectUid by rememberSaveable { mutableStateOf<String?>(null) }
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    val tags by viewModel.tags.collectAsStateWithLifecycle()
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
    // Une notification de proposition échouée ouvre Planifier.
    LaunchedEffect(showPlan) {
        if (showPlan) {
            tab = TasksTab.UPCOMING
            onPlanShown()
        }
    }
    // « Voir » après une capture sans date : Planifier, tiroir « À placer » ouvert par PlanTab.
    val trayRequested by PlanTrayRequest.pending.collectAsStateWithLifecycle()
    LaunchedEffect(trayRequested) {
        if (trayRequested) {
            openProjectUid = null
            openTagUid = null
            openViewUid = null
            tab = TasksTab.UPCOMING
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
    BackHandler(enabled = openViewUid != null && openProjectUid == null && openTagUid == null) { openViewUid = null }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val viewsClient = remember(context) { ch.nicolab.cadence.tasks.TasksGraph.views(context) }
    var savedViews by remember { mutableStateOf<List<SavedView>>(emptyList()) }
    LaunchedEffect(switcherOpen) {
        runCatching { viewsClient.listAll() }.onSuccess { savedViews = it }
    }
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
        // Planifier dit sa semaine et sa charge sous la bande des jours.
        tab == TasksTab.UPCOMING -> null
        tab == TasksTab.PROJECTS -> projectCounterLine(projects)
        tab == TasksTab.TAGS -> null
        // Pas de phrase d'explication sous le titre (comme le web, qui a retiré ses boutons « i »).
        tab == TasksTab.NOTES -> null
        tab == TasksTab.DONE -> null
        // Aujourd'hui : la date et l'avancée du jour ; les événements ont leur bande en tête de liste.
        // Aujourd'hui : la date, et ce qui est fait une fois qu'il y en a ; aucun compte de ce qui reste.
        tab == TasksTab.TODAY -> {
            val done = todayState.completed.size
            if (done == 0) dateLine else "$dateLine · ${pluralStringResource(R.plurals.tasks_done_count, done, done)}"
        }
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
                        // Deux boutons seulement : la recherche, et « ⋯ » pour l'affichage, les notifications et les réglages.
                        RoundHeaderButton(
                            icon = Icons.Outlined.Search,
                            contentDescription = stringResource(R.string.tasks_search_open),
                            onClick = onOpenSearch,
                        )
                        val weekAction = if ((tab == TasksTab.TODAY || tab == TasksTab.UPCOMING) && openProjectUid == null) rememberProposalAction(ProposalKind.WEEK) else null
                        HeaderMoreMenu(
                            screenAction = weekAction?.takeIf { it.visible }?.let { HeaderToggle(it.label, it.onClick) },
                            notesToggle = if (tab == TasksTab.NOTES && openProjectUid == null) {
                                HeaderToggle(
                                    stringResource(if (notesGallery) R.string.links_show_list else R.string.links_show_gallery),
                                ) {
                                    notesGallery = !notesGallery
                                    layouts.set(LayoutStore.NOTES, notesGallery)
                                }
                            } else {
                                null
                            },
                            doneToggle = if ((tab == TasksTab.TODAY || tab == TasksTab.UPCOMING) && openProjectUid == null) {
                                val hidden = if (tab == TasksTab.TODAY) hideDoneToday else hideDonePlan
                                HeaderToggle(stringResource(if (hidden) R.string.plan_show_done else R.string.plan_hide_done)) {
                                    if (tab == TasksTab.TODAY) {
                                        hideDoneToday = !hideDoneToday
                                        layouts.set(LayoutStore.HIDE_DONE_TODAY, hideDoneToday)
                                    } else {
                                        hideDonePlan = !hideDonePlan
                                        layouts.set(LayoutStore.HIDE_DONE_PLAN, hideDonePlan)
                                    }
                                }
                            } else {
                                null
                            },
                            onOpenNotifications = onOpenNotifications,
                            onOpenSettings = onOpenSettings,
                        )
                    },
                )
                // Sous l'en-tête, pas dans ses actions : un libellé de plugin y mangeait la place du titre.
                pluginPlace?.let { place ->
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Space.gutter - Space.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        PluginActionButtons(place = place, context = pluginContext, menu = pluginMenu)
                    }
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
                    val currentView = openViewUid?.let { uid -> savedViews.firstOrNull { it.uid == uid } }
                    when {
                        projectUid != null -> ProjectTasksPane(
                            viewModel = viewModel,
                            projectUid = projectUid,
                            onBack = { openProjectUid = null },
                            onOpenProject = { openProjectUid = it },
                            onOpen = { selectedTaskUid = it.uid },
                            onOpenNote = {
                                selectedNoteIsNew = false
                                selectedNoteProjectUid = null
                                selectedNoteUid = it.uid
                            },
                            onNewNote = {
                                selectedNoteIsNew = true
                                selectedNoteProjectUid = projectUid
                                selectedNoteUid = UUID.randomUUID().toString()
                            },
                            modifier = Modifier.fillMaxSize(),
                        )
                        currentView != null -> ViewTasksPane(
                            viewModel = viewModel,
                            savedView = currentView,
                            onBack = { openViewUid = null },
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
            // Dans la barre du bas : le coin bas droit reste au contenu.
            PrimaryAdd(
                icon = Icons.Outlined.Add,
                label = stringResource(
                    if (tab == TasksTab.NOTES) R.string.tasks_note_new else R.string.tasks_fab_add,
                ),
                onClick = {
                    if (tab == TasksTab.NOTES) {
                        selectedNoteIsNew = true
                        selectedNoteProjectUid = null
                        selectedNoteUid = UUID.randomUUID().toString()
                    } else if (tab == TasksTab.PROJECTS && openProjectUid == null) {
                        projectAddChooserOpen = true
                    } else {
                        quickAddOpen = true
                    }
                },
                fabModifier = Modifier
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
            pinned = remember(projects, notes, tags, savedViews) { PinnedShortcuts.of(projects, notes, tags, savedViews) },
            views = savedViews,
            onOpenView = { view ->
                switcherOpen = false
                openProjectUid = null
                openTagUid = null
                openViewUid = view.uid
            },
            areas = areas,
            areaFilter = areaFilter,
            withLink = withLink,
            onSelectTab = {
                tab = it
                openTagUid = null
                openProjectUid = null
                openViewUid = null
                switcherOpen = false
            },
            onOpenPinned = { shortcut ->
                switcherOpen = false
                when (shortcut.kind) {
                    PinnedShortcut.Kind.PROJECT -> {
                        tab = TasksTab.PROJECTS
                        openViewUid = null
                        openProjectUid = shortcut.uid
                    }
                    PinnedShortcut.Kind.NOTE -> {
                        selectedNoteIsNew = false
                        selectedNoteProjectUid = null
                        selectedNoteUid = shortcut.uid
                    }
                    PinnedShortcut.Kind.TAG -> {
                        tab = TasksTab.TAGS
                        openViewUid = null
                        openTagUid = shortcut.uid
                    }
                    PinnedShortcut.Kind.VIEW -> {
                        openProjectUid = null
                        openTagUid = null
                        openViewUid = shortcut.uid
                    }
                }
            },
            onUnpin = { shortcut ->
                when (shortcut.kind) {
                    PinnedShortcut.Kind.PROJECT -> viewModel.setProjectPinned(shortcut.uid, false)
                    PinnedShortcut.Kind.NOTE -> viewModel.saveNoteAttributes(shortcut.uid, NoteChange(pinned = false))
                    PinnedShortcut.Kind.TAG -> viewModel.setTagPinned(shortcut.uid, false)
                    PinnedShortcut.Kind.VIEW -> scope.launch {
                        runCatching { viewsClient.setPinned(shortcut.uid, false) }
                            .onSuccess {
                                savedViews = savedViews.map { if (it.uid == shortcut.uid) it.copy(isPinned = false) else it }
                            }
                            .onFailure {
                                android.widget.Toast.makeText(context, R.string.views_unpin_offline, android.widget.Toast.LENGTH_SHORT).show()
                            }
                    }
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
    if (projectAddChooserOpen) {
        ProjectAddChooserSheet(
            onAddTaskOrNote = { quickAddOpen = true },
            onFromTemplate = { templatesPickerOpen = true },
            onDismiss = { projectAddChooserOpen = false },
        )
    }
    if (templatesPickerOpen) {
        val ctx = LocalContext.current
        TemplatesPickerSheet(
            onCloned = { createdName ->
                templatesPickerOpen = false
                viewModel.requestSync()
                android.widget.Toast.makeText(
                    ctx,
                    ctx.getString(R.string.templates_cloned_notice, createdName),
                    android.widget.Toast.LENGTH_SHORT,
                ).show()
            },
            onDismiss = { templatesPickerOpen = false },
        )
    }
    if (quickAddOpen) {
        QuickAddSheet(
            onDismiss = { quickAddOpen = false },
            targets = listOf(CaptureTarget.TASK, CaptureTarget.INBOX, CaptureTarget.NOTE),
            initialProjectUid = openProjectUid,
            onNoteCreated = {
                selectedNoteIsNew = false
                selectedNoteProjectUid = null
                selectedNoteUid = it
            },
        )
    }
    selectedNoteUid?.let { uid ->
        NoteScreen(
            viewModel,
            uid,
            isNew = selectedNoteIsNew,
            onBack = {
                selectedNoteUid = null
                selectedNoteProjectUid = null
            },
            onOpenNote = {
                selectedNoteProjectUid = null
                selectedNoteUid = it
            },
            onOpenTask = { selectedTaskUid = it },
            initialProjectUid = selectedNoteProjectUid,
        )
    }
}

/** Date du jour en court français, initiale en capitale : « Ven. 30 oct. ». */
private fun formatHeaderDate(date: LocalDate): String =
    DateTimeFormatter.ofPattern("EEE d MMM", Locale.FRENCH)
        .format(date)
        .replaceFirstChar { it.uppercaseChar() }
