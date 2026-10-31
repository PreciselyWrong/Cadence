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
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceFab
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.SyncStatus
import kotlinx.coroutines.launch

/**
 * Écran Inbox : les idées capturées, à trier. Le bouton d'ajout ouvre la saisie avec le choix
 * de la destination (Inbox, tâche, note), comme sur le web ; les notes se lisent dans Tâches › Notes.
 */
@Composable
fun InboxScreen(modifier: Modifier = Modifier, onOpenSearch: () -> Unit = {}, onOpenSettings: () -> Unit) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = rememberAppSnackbarHostState()
    val captureFocus = remember { FocusRequester() }
    var selectedTaskUid by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedNoteUid by rememberSaveable { mutableStateOf<String?>(null) }
    var captureOpen by rememberSaveable { mutableStateOf(false) }
    val ideas by viewModel.inbox.collectAsStateWithLifecycle()
    val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()
    DeletionUndoEffect(viewModel, snackbar)

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { padding ->
        CollapsingHeaderHost(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.fillMaxSize()) {
                ScreenHeader(
                    title = stringResource(R.string.tasks_inbox_title),
                    subtitle = pluralStringResource(R.plurals.tasks_inbox_subtitle, ideas.size, ideas.size),
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
                SyncStatusLine(
                    status = syncStatus,
                    modifier = Modifier.padding(horizontal = Space.gutter, vertical = Space.xs),
                )
                PullToRefreshBox(
                    isRefreshing = syncStatus is SyncStatus.Syncing,
                    onRefresh = viewModel::requestSync,
                    modifier = Modifier.weight(1f),
                ) {
                    InboxTab(
                        viewModel = viewModel,
                        captureFocus = captureFocus,
                        onOpen = { selectedTaskUid = it.uid },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            CadenceFab(
                icon = Icons.Outlined.Add,
                contentDescription = stringResource(R.string.tasks_capture_open),
                onClick = { captureOpen = true },
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
    if (captureOpen) {
        QuickAddSheet(
            onDismiss = { captureOpen = false },
            targets = listOf(CaptureTarget.INBOX, CaptureTarget.TASK, CaptureTarget.NOTE),
            onNoteCreated = { selectedNoteUid = it },
        )
    }
    selectedNoteUid?.let { uid ->
        NoteScreen(viewModel, uid, isNew = false, onBack = { selectedNoteUid = null })
    }
}

/** Bandeau « Annuler » des suppressions de notes et d'idées, sur l'écran qui les montre. */
@Composable
internal fun DeletionUndoEffect(viewModel: TasksViewModel, snackbar: SnackbarHostState) {
    val noteDeleted = stringResource(R.string.tasks_note_deleted)
    val ideaDeleted = stringResource(R.string.tasks_idea_deleted)
    val undoLabel = stringResource(R.string.tasks_undo)
    LaunchedEffect(viewModel) {
        viewModel.deletions.collect { deletion ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(
                    message = if (deletion.kind == DeletionKind.Note) noteDeleted else ideaDeleted,
                    actionLabel = undoLabel,
                    duration = SnackbarDuration.Short,
                )
                if (result == SnackbarResult.ActionPerformed) viewModel.undoDeletion(deletion.uid)
            }
        }
    }
}
