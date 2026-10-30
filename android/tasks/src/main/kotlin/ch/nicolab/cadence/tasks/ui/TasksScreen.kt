@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.annotation.StringRes
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.SyncStatus

internal enum class TasksTab(@StringRes val label: Int) {
    TODAY(R.string.tasks_tab_today),
    UPCOMING(R.string.tasks_tab_upcoming),
    INBOX(R.string.tasks_tab_inbox),
    PROJECTS(R.string.tasks_tab_projects),
}

/**
 * Écran Tâches : quatre onglets, tirer pour synchroniser, ajout rapide.
 * [openTaskUid] ouvre directement la fiche d'une tâche (depuis le widget ou un rappel).
 */
@Composable
fun TasksScreen(modifier: Modifier = Modifier, openTaskUid: String? = null) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = remember { SnackbarHostState() }
    val captureFocus = remember { FocusRequester() }
    var tab by rememberSaveable { mutableStateOf(TasksTab.TODAY) }
    var openProjectUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedTaskUid by rememberSaveable { mutableStateOf(openTaskUid) }
    var quickAddOpen by rememberSaveable { mutableStateOf(false) }
    val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()
    val pendingMove by viewModel.pendingMove.collectAsStateWithLifecycle()

    LaunchedEffect(openTaskUid) {
        if (openTaskUid != null) selectedTaskUid = openTaskUid
    }
    LaunchedEffect(viewModel) {
        viewModel.messages.collect { snackbar.showSnackbar(it) }
    }
    BackHandler(enabled = openProjectUid != null) { openProjectUid = null }

    Scaffold(
        modifier = modifier,
        floatingActionButton = {
            FloatingActionButton(onClick = {
                if (tab == TasksTab.INBOX) captureFocus.requestFocus() else quickAddOpen = true
            }) {
                Icon(Icons.Outlined.Add, contentDescription = stringResource(R.string.tasks_fab_add))
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (openProjectUid == null) {
                PrimaryScrollableTabRow(selectedTabIndex = tab.ordinal, edgePadding = 16.dp) {
                    TasksTab.entries.forEach { entry ->
                        Tab(
                            selected = tab == entry,
                            onClick = { tab = entry },
                            text = { Text(stringResource(entry.label)) },
                        )
                    }
                }
            }
            SyncStatusLine(
                status = syncStatus,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
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
                    tab == TasksTab.TODAY -> TodayTab(
                        viewModel = viewModel,
                        onOpen = { selectedTaskUid = it.uid },
                        modifier = Modifier.fillMaxSize(),
                    )
                    tab == TasksTab.UPCOMING -> UpcomingTab(
                        viewModel = viewModel,
                        onOpen = { selectedTaskUid = it.uid },
                        modifier = Modifier.fillMaxSize(),
                    )
                    tab == TasksTab.INBOX -> InboxTab(
                        viewModel = viewModel,
                        captureFocus = captureFocus,
                        onOpen = { selectedTaskUid = it.uid },
                        modifier = Modifier.fillMaxSize(),
                    )
                    else -> ProjectsTab(
                        viewModel = viewModel,
                        onOpenProject = { openProjectUid = it },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }

    selectedTaskUid?.let { uid ->
        TaskDetailSheet(taskUid = uid, viewModel = viewModel, onDismiss = { selectedTaskUid = null })
    }
    if (quickAddOpen) {
        QuickAddSheet(onDismiss = { quickAddOpen = false })
    }
    if (pendingMove != null) {
        RecurringMoveDialog(onAnswer = viewModel::answerRecurringMove)
    }
}
