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
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.SyncStatusText
import java.time.Instant

/**
 * Petite ligne d'état de synchronisation ; invisible quand tout est à jour dans les listes ([always] la montre
 * aussi alors, pour Réglages : « Synchronisé · il y a 2 min »).
 */
@Composable
internal fun SyncStatusLine(status: SyncStatus, modifier: Modifier = Modifier, always: Boolean = false) {
    if (!always && status is SyncStatus.Idle && status.pendingOps == 0) return

    val text = SyncStatusText.line(status, Instant.now())
    val icon = when (status) {
        SyncStatus.NotConnected, is SyncStatus.Offline -> Icons.Outlined.CloudOff
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
