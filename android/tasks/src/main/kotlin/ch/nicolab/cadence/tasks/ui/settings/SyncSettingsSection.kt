package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
import ch.nicolab.cadence.tasks.model.ConflictRow
import ch.nicolab.cadence.tasks.model.RefusedItem
import ch.nicolab.cadence.tasks.model.ServerConflict
import ch.nicolab.cadence.tasks.model.ServerSyncStatus
import ch.nicolab.cadence.tasks.model.SyncConflictMerge
import ch.nicolab.cadence.tasks.model.TodoMdRepos
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
 * Réglages, Synchronisation : l'état précis, ce que le serveur ne connaît pas encore, les appareils et leur dernière
 * synchro (lus sur le serveur), les conflits (ceux du serveur, perdus par n'importe quel appareil, et ceux que seul le
 * téléphone connaît, un seul par champ ; les deux valeurs, au choix) et les refus du serveur. Rien de tout cela ne s'affiche quand tout va bien.
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
    val client = remember(context) { TasksGraph.syncStatus(context) }
    var server by remember { mutableStateOf<ServerSyncStatus?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    val connected = status != SyncStatus.NotConnected
    // Relu à l'ouverture, quand la liste du téléphone change et après chaque réglage ; hors ligne, la dernière
    // lecture reste (ou rien), et la liste du téléphone s'affiche seule.
    LaunchedEffect(connected, conflicts, reload) {
        if (connected) client.status().onSuccess { server = it }
    }
    val rows = SyncConflictMerge.merge(conflicts, server?.conflicts.orEmpty())
    val resolveServer: (ConflictRow.Server, Boolean) -> Unit = { row, keepLost ->
        scope.launch {
            client.resolve(row.conflict.id, keepLost).onSuccess {
                row.localId?.let { repository.resolveConflict(it, keepLocal = false) }
                if (keepLost) repository.requestSync()
                reload++
            }
        }
    }

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
        val devices = server?.devices.orEmpty()
        if (connected && devices.isNotEmpty()) {
            HorizontalDivider()
            Text(stringResource(R.string.tasks_sync_devices_title), style = MaterialTheme.typography.titleSmall)
            val now = Instant.now()
            devices.forEach { device ->
                Text(
                    listOfNotNull(
                        device.name,
                        device.lastUsedAt?.let { stringResource(R.string.tasks_sync_device_seen, SyncStatusText.ago(it, now)) },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        if (rows.isNotEmpty()) {
            HorizontalDivider()
            Text(stringResource(R.string.tasks_sync_conflicts_title), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.tasks_sync_conflicts_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            rows.forEach { row ->
                when (row) {
                    is ConflictRow.Server -> ServerConflictRow(
                        row.conflict,
                        keepLost = { resolveServer(row, true) },
                        keepCurrent = { resolveServer(row, false) },
                    )
                    is ConflictRow.Local -> ConflictRow(
                        row.item,
                        keepLocal = { scope.launch { repository.resolveConflict(row.item.id, keepLocal = true) } },
                        keepServer = { scope.launch { repository.resolveConflict(row.item.id, keepLocal = false) } },
                    )
                }
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

/** Conflit lu sur le serveur, perdu par n'importe quel appareil : réglé sur le serveur, pour tous. */
@Composable
private fun ServerConflictRow(conflict: ServerConflict, keepLost: () -> Unit, keepCurrent: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            listOfNotNull(conflict.entityLabel, conflict.name?.let { "« $it »" }, conflict.fieldLabel).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(stringResource(R.string.tasks_sync_conflict_lost, conflict.lostText), style = MaterialTheme.typography.bodySmall)
        Text(
            stringResource(R.string.tasks_sync_conflict_kept, conflict.currentText),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            if (conflict.canKeepLost) {
                SecondaryAction(stringResource(R.string.tasks_sync_keep_lost), Modifier.weight(1f), onClick = keepLost)
                SecondaryAction(stringResource(R.string.tasks_sync_keep_current), Modifier.weight(1f), onClick = keepCurrent)
            } else {
                SecondaryAction(stringResource(R.string.tasks_sync_dismiss), Modifier.weight(1f), onClick = keepCurrent)
            }
        }
    }
}

@Composable
private fun RefusedRow(item: RefusedItem) {
    Text(
        listOfNotNull(item.entityLabel, item.name?.let { "« $it »" }, TodoMdRepos.rejection(item.reason) ?: item.reason).joinToString(" · "),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
