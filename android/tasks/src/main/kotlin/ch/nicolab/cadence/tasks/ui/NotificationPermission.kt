package ch.nicolab.cadence.tasks.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler

/** État de la permission de notifications, demandée depuis le flux des tâches. */
internal class NotificationPermission(val allowed: Boolean, val request: () -> Unit)

/**
 * Demande POST_NOTIFICATIONS (Android 13+) quand l'utilisateur en a besoin pour ses rappels.
 * Sur les versions antérieures, la permission n'existe pas au runtime : seul le réglage compte.
 */
@Composable
internal fun rememberNotificationPermission(): NotificationPermission {
    val context = LocalContext.current
    var allowed by remember { mutableStateOf(TaskReminderScheduler.notificationsAllowed(context)) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        allowed = TaskReminderScheduler.notificationsAllowed(context)
    }
    return remember(allowed) {
        NotificationPermission(
            allowed = allowed,
            request = {
                if (!allowed && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            },
        )
    }
}

/** Ligne affichée quand les rappels ne peuvent pas s'afficher, avec accès aux réglages de l'app. */
@Composable
internal fun NotificationsOffNotice(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    Column(modifier = modifier) {
        Text(
            text = stringResource(R.string.tasks_notifications_off),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
        TextButton(onClick = {
            context.startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
            )
        }) { Text(stringResource(R.string.tasks_notifications_settings)) }
    }
}
