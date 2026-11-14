package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.live.NotificationCenter

/** Entrée de menu qui bascule un affichage de l'écran ouvert. */
internal data class HeaderToggle(val label: String, val onToggle: () -> Unit)

/**
 * « ⋯ » de l'en-tête des Tâches : les bascules d'affichage de l'écran ouvert, Notifications (avec le nombre de non
 * lues ; un point sur le bouton en signale) et Réglages. Remplace l'œil, la cloche et l'engrenage.
 */
@Composable
internal fun HeaderMoreMenu(
    notesToggle: HeaderToggle?,
    doneToggle: HeaderToggle?,
    /** Action propre à l'écran ouvert, en tête du menu (Aujourd'hui : « Planifier ma semaine (IA) »). */
    screenAction: HeaderToggle? = null,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val context = LocalContext.current
    val unread by NotificationCenter.unread.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { NotificationCenter.refreshUnread(context) }
    var open by remember { mutableStateOf(false) }
    Box {
        RoundHeaderButton(
            icon = Icons.Outlined.MoreVert,
            contentDescription = stringResource(R.string.tasks_header_more),
            onClick = { open = true },
        )
        if (unread > 0) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 6.dp, end = 6.dp)
                    .size(8.dp)
                    .background(cadence.primary, CircleShape),
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            listOfNotNull(screenAction, notesToggle, doneToggle).forEach { toggle ->
                DropdownMenuItem(text = { Text(toggle.label) }, onClick = {
                    open = false
                    toggle.onToggle()
                })
            }
            val notifications = stringResource(R.string.notifications_title)
            DropdownMenuItem(
                text = { Text(if (unread > 0) "$notifications (${if (unread > 9) "9+" else unread})" else notifications) },
                onClick = {
                    open = false
                    onOpenNotifications()
                },
            )
            DropdownMenuItem(text = { Text(stringResource(R.string.tasks_open_settings)) }, onClick = {
                open = false
                onOpenSettings()
            })
        }
    }
}
