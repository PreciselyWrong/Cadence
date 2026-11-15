package ch.nicolab.cadence.tasks.plugins

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import kotlinx.coroutines.launch

/**
 * Boutons que les plugins ajoutent à l'en-tête d'un écran pour [place]. Rien quand aucun plugin n'en propose ; une
 * action `run` agit côté serveur sans rien ouvrir, les autres ouvrent la page du plugin avec l'action et le contexte.
 */
@Composable
internal fun PluginActionButtons(
    place: String,
    context: Map<String, String?>,
    menu: PluginMenu = rememberPluginMenu(Unit),
) {
    val actions = PluginActions.forPlace(menu, place)
    if (actions.isEmpty()) return
    val androidContext = LocalContext.current
    actions.forEach { action ->
        if (action.run) {
            RunActionButton(action = action, place = place, context = context)
        } else {
            val item = menu.items.firstOrNull { it.id == action.plugin } ?: return@forEach
            TextButton(
                onClick = {
                    androidContext.startActivity(
                        PluginPageActivity.intent(androidContext, item, PluginActions.query(action.id, place, context)),
                    )
                },
                contentPadding = PaddingValues(horizontal = Space.sm),
            ) {
                Text(action.label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
            }
        }
    }
}

@Composable
private fun RunActionButton(
    action: PluginAction,
    place: String,
    context: Map<String, String?>,
) {
    val androidContext = LocalContext.current
    val snackbar = rememberAppSnackbarHostState()
    val scope = rememberCoroutineScope()
    val client = remember(androidContext) { pluginsClient(androidContext) }
    val doneFallback = stringResource(R.string.plugins_run_done)
    val failedFallback = stringResource(R.string.plugins_run_failed)
    var running by remember(action.plugin, action.id) { mutableStateOf(false) }
    TextButton(
        enabled = !running,
        onClick = {
            if (running) return@TextButton
            running = true
            scope.launch {
                val text = try {
                    val cleanContext = buildMap {
                        context.forEach { (key, value) ->
                            if (!value.isNullOrEmpty()) put(key, value)
                        }
                    }
                    client.runAction(action.plugin, action.id, place, cleanContext).fold(
                        onSuccess = { result ->
                            result.message.ifBlank { if (result.ok) doneFallback else failedFallback }
                        },
                        onFailure = { failedFallback },
                    )
                } finally {
                    running = false
                }
                // showSnackbar attend la fin de la bannière : le bouton redevient libre avant.
                snackbar.showSnackbar(text)
            }
        },
        contentPadding = PaddingValues(horizontal = Space.sm),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(action.label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
            action.status?.let { status ->
                Text(
                    status,
                    style = MaterialTheme.typography.labelSmall,
                    color = cadence.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
