package ch.nicolab.cadence.tasks.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.Shape
import ch.nicolab.cadence.calendar.EventLocation
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.tasks.R

/**
 * Lieu d'un événement, touchable. Un lien web s'ouvre dans le navigateur ; une adresse ouvre un menu
 * « Ouvrir dans Maps » / « Copier l'adresse ».
 */
@Composable
internal fun EventLocationRow(location: String, label: String, shape: Shape) {
    val context = LocalContext.current
    var menuOpen by remember { mutableStateOf(false) }
    val noApp = stringResource(R.string.tasks_event_location_no_app)
    val copied = stringResource(R.string.tasks_event_location_copied)
    Box {
        SettingRow(
            title = location,
            subtitle = label,
            icon = Icons.Outlined.Place,
            shape = shape,
            trailing = {},
            onClick = {
                if (EventLocation.isWebLink(location)) {
                    openUrl(context, location.trim(), noApp)
                } else {
                    menuOpen = true
                }
            },
        )
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.tasks_event_location_open_maps)) },
                onClick = {
                    menuOpen = false
                    openInMaps(context, location, noApp)
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.tasks_event_location_copy)) },
                onClick = {
                    menuOpen = false
                    copyAddress(context, location, copied)
                },
            )
        }
    }
}

// L'URI geo ouvre l'application de cartes par défaut ; sans elle, la recherche Maps du navigateur.
private fun openInMaps(context: Context, address: String, noApp: String) {
    val geo = Intent(Intent.ACTION_VIEW, Uri.parse(EventLocation.geoUri(address)))
    try {
        context.startActivity(geo)
    } catch (_: ActivityNotFoundException) {
        openUrl(context, EventLocation.mapsSearchUrl(address), noApp)
    }
}

internal fun openUrl(context: Context, url: String, noApp: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, noApp, Toast.LENGTH_SHORT).show()
    }
}

private fun copyAddress(context: Context, address: String, copied: String) {
    val clipboard = context.getSystemService(ClipboardManager::class.java)
    clipboard.setPrimaryClip(ClipData.newPlainText("Lieu", address.trim()))
    Toast.makeText(context, copied, Toast.LENGTH_SHORT).show()
}
