package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.RefusedItem
import ch.nicolab.cadence.tasks.model.SyncConflictItem
import ch.nicolab.cadence.tasks.model.SyncConflictText
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.SyncStatusText
import ch.nicolab.cadence.tasks.ui.SyncStatusLine
import java.time.Instant
import kotlinx.coroutines.launch

/** Sous-titre de la ligne « Synchronisation » de Réglages : l'état en une phrase. */
@Composable
fun syncSettingsSummary(): String {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.repository(context) }
    val status by repository.observeSyncStatus().collectAsStateWithLifecycle(initialValue = SyncStatus.Syncing)
    return SyncStatusText.line(status, Instant.now())
}

/**
 * Réglages, Synchronisation : l'état précis, ce que le serveur ne connaît pas encore, les conflits perdus par le
 * téléphone (les deux valeurs, au choix) et les refus du serveur. Rien de tout cela ne s'affiche quand tout va bien.
 */
@Composable
fun SyncSettingsSection(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.repository(context) }
    val status by repository.observeSyncStatus().collectAsStateWithLifecycle(initialValue = SyncStatus.Syncing)
    val unsupported by repository.observeUnsupportedEntities().collectAsStateWithLifecycle(initialValue = emptyList())
    val conflicts by repository.observeConflicts().collectAsStateWithLifecycle(initialValue = emptyList())
    val refused by repository.observeRefused().collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SyncStatusLine(status, always = true)
        if (status != SyncStatus.NotConnected) {
            PrimaryAction(stringResource(R.string.tasks_sync_now), Modifier.fillMaxWidth()) { repository.requestSync() }
        }
        if (unsupported.isNotEmpty()) {
            Text(
                stringResource(R.string.tasks_sync_unsupported, unsupported.joinToString(", ") { SyncConflictText.entityLabel(it).lowercase() }),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (conflicts.isNotEmpty()) {
            HorizontalDivider()
            Text(stringResource(R.string.tasks_sync_conflicts_title), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.tasks_sync_conflicts_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            conflicts.forEach { conflict ->
                ConflictRow(
                    conflict,
                    keepLocal = { scope.launch { repository.resolveConflict(conflict.id, keepLocal = true) } },
                    keepServer = { scope.launch { repository.resolveConflict(conflict.id, keepLocal = false) } },
                )
            }
        }
        if (refused.isNotEmpty()) {
            HorizontalDivider()
            Text(stringResource(R.string.tasks_sync_refused_title), style = MaterialTheme.typography.titleSmall)
            refused.forEach { RefusedRow(it) }
            SecondaryAction(stringResource(R.string.tasks_sync_refused_clear), Modifier.fillMaxWidth()) {
                scope.launch { repository.clearRefused() }
            }
        }
    }
}

@Composable
private fun ConflictRow(conflict: SyncConflictItem, keepLocal: () -> Unit, keepServer: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            listOfNotNull(conflict.entityLabel, conflict.name?.let { "« $it »" }, conflict.fieldLabel).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            stringResource(R.string.tasks_sync_conflict_local, conflict.localText),
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            conflict.serverText?.let { stringResource(R.string.tasks_sync_conflict_server, it) }
                ?: stringResource(R.string.tasks_sync_conflict_server_unknown),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            if (conflict.canKeepLocal) {
                SecondaryAction(stringResource(R.string.tasks_sync_keep_local), Modifier.weight(1f), onClick = keepLocal)
                SecondaryAction(stringResource(R.string.tasks_sync_keep_server), Modifier.weight(1f), onClick = keepServer)
            } else {
                SecondaryAction(stringResource(R.string.tasks_sync_dismiss), Modifier.weight(1f), onClick = keepServer)
            }
        }
    }
}

@Composable
private fun RefusedRow(item: RefusedItem) {
    Text(
        listOfNotNull(item.entityLabel, item.name?.let { "« $it »" }, item.reason).joinToString(" · "),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
