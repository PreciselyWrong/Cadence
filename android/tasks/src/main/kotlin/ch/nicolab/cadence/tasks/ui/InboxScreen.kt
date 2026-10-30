package ch.nicolab.cadence.tasks.ui

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
import androidx.compose.material3.Scaffold
import ch.nicolab.cadence.designsystem.components.CollapsingHeaderHost
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceFab
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.SyncStatus

/**
 * Écran Boîte : captures à trier et tâches sans échéance ni projet. Le bouton d'ajout
 * place le curseur dans le champ de capture.
 */
@Composable
fun InboxScreen(modifier: Modifier = Modifier, onOpenSearch: () -> Unit = {}, onOpenSettings: () -> Unit) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    val captureFocus = remember { FocusRequester() }
    var selectedTaskUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedNoteUid by rememberSaveable { mutableStateOf<String?>(null) }
    var segment by rememberSaveable { mutableIntStateOf(0) }
    val notes by viewModel.notes.collectAsStateWithLifecycle()
    val ideaCount by viewModel.inbox.collectAsStateWithLifecycle()
    val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { padding ->
        CollapsingHeaderHost(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.fillMaxSize()) {
                ScreenHeader(
                    title = stringResource(R.string.tasks_inbox_title),
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
                SegmentedTabs(
                    labels = listOf(
                        "${stringResource(R.string.tasks_inbox_segment_ideas)} ${ideaCount.size}",
                        "${stringResource(R.string.tasks_inbox_segment_notes)} ${notes.size}",
                    ),
                    selected = segment,
                    onSelect = { segment = it },
                    modifier = Modifier.padding(horizontal = Space.gutter, vertical = Space.xs),
                )
                PullToRefreshBox(
                    isRefreshing = syncStatus is SyncStatus.Syncing,
                    onRefresh = viewModel::requestSync,
                    modifier = Modifier.weight(1f),
                ) {
                    if (segment == 0) {
                        InboxTab(
                            viewModel = viewModel,
                            captureFocus = captureFocus,
                            onOpen = { selectedTaskUid = it.uid },
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        NotesTab(viewModel = viewModel, onOpen = { selectedNoteUid = it.uid }, modifier = Modifier.fillMaxSize())
                    }
                }
            }
            if (segment == 0) {
                CadenceFab(
                    icon = Icons.Outlined.Add,
                    contentDescription = stringResource(R.string.tasks_fab_add),
                    onClick = { captureFocus.requestFocus() },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = Space.gutter, bottom = navigationClearance() + Space.lg),
                )
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
