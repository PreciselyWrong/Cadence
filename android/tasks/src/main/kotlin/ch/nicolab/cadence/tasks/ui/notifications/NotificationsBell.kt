package ch.nicolab.cadence.tasks.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.live.NotificationCenter

/** Cloche de l'en-tête, à côté des Réglages : ouvre l'écran des notifications, avec le nombre de non lues. */
@Composable
fun NotificationsBellButton(onClick: () -> Unit) {
    val context = LocalContext.current
    val unread by NotificationCenter.unread.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { NotificationCenter.refreshUnread(context) }
    val palette = cadence
    Box {
        RoundHeaderButton(
            icon = Icons.Outlined.Notifications,
            contentDescription = stringResource(R.string.notifications_title),
            onClick = onClick,
        )
        if (unread > 0) {
            Text(
                text = if (unread > 9) "9+" else unread.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = palette.onPrimary,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                    .background(palette.primary, CircleShape)
                    .padding(horizontal = 4.dp),
            )
        }
    }
}
