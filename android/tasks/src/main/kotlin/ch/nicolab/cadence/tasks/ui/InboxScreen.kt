package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.SyncStatus

/**
 * Écran Boîte : captures à trier et tâches sans échéance ni projet. Le bouton d'ajout
 * place le curseur dans le champ de capture.
 */
@Composable
fun InboxScreen(modifier: Modifier = Modifier, onOpenSettings: () -> Unit) {
    val viewModel: TasksViewModel = viewModel()
    val snackbar = remember { SnackbarHostState() }
    val captureFocus = remember { FocusRequester() }
    var selectedTaskUid by rememberSaveable { mutableStateOf<String?>(null) }
    val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar, Modifier.padding(bottom = navigationClearance())) },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.fillMaxSize()) {
                ScreenHeader(
                    title = stringResource(R.string.tasks_inbox_title),
                    modifier = Modifier.statusBarsPadding().padding(horizontal = Space.gutter),
                    actions = {
                        RoundHeaderButton(
                            icon = Icons.Outlined.Settings,
                            contentDescription = stringResource(R.string.tasks_open_settings),
                            onClick = onOpenSettings,
                        )
                    },
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
                contentDescription = stringResource(R.string.tasks_fab_add),
                onClick = { captureFocus.requestFocus() },
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
}
