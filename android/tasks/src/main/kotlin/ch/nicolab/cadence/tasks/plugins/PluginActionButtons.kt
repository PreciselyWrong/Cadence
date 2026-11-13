package ch.nicolab.cadence.tasks.plugins

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import ch.nicolab.cadence.designsystem.theme.Space

/**
 * Boutons que les plugins ajoutent à l'en-tête d'un écran pour [place]. Rien quand aucun plugin n'en propose ; un
 * appui ouvre la page du plugin avec l'action et le contexte de l'écran dans sa requête.
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
        val item = menu.items.first { it.id == action.plugin }
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
