package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.SyncStatus

/** Petite ligne d'état de synchronisation ; invisible quand tout est à jour. */
@Composable
internal fun SyncStatusLine(status: SyncStatus, modifier: Modifier = Modifier) {
    if (status is SyncStatus.Idle && status.pendingOps == 0) return

    val text = when (status) {
        SyncStatus.NotConnected -> stringResource(R.string.tasks_sync_not_connected)
        SyncStatus.Syncing -> stringResource(R.string.tasks_sync_running)
        is SyncStatus.Idle -> pluralStringResource(R.plurals.tasks_sync_pending, status.pendingOps, status.pendingOps)
        is SyncStatus.Failed -> status.message
    }
    val icon = when (status) {
        SyncStatus.NotConnected -> Icons.Outlined.CloudOff
        is SyncStatus.Failed -> Icons.Outlined.ErrorOutline
        else -> Icons.Outlined.Sync
    }
    val color = if (status is SyncStatus.Failed) {
        MaterialTheme.colorScheme.error
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(text = text, style = MaterialTheme.typography.labelMedium, color = color)
    }
}
