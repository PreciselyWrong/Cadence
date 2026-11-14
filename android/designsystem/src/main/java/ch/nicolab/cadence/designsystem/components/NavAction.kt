package ch.nicolab.cadence.designsystem.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector

/** Le geste « ajouter » de l'écran ouvert, que la barre du bas dessine à droite de ses onglets. */
class NavAction(val icon: ImageVector, val label: String, val onClick: () -> Unit)

/** Porte le [NavAction] de l'onglet ouvert jusqu'à la barre du bas ; null : aucune barre, le bouton flotte. */
@Stable
class NavActionHost {
    var action: NavAction? by mutableStateOf(null)
        internal set

    internal var owner: Any? = null
}

val LocalNavActionHost = staticCompositionLocalOf<NavActionHost?> { null }

/**
 * Bouton « ajouter » d'un écran : posé dans la barre du bas quand elle existe (le coin bas droit reste libre pour le
 * contenu), sinon bouton flottant [CadenceFab] à [fabModifier].
 */
@Composable
fun PrimaryAdd(icon: ImageVector, label: String, onClick: () -> Unit, fabModifier: Modifier = Modifier) {
    val host = LocalNavActionHost.current
    if (host == null) {
        CadenceFab(icon = icon, contentDescription = label, onClick = onClick, modifier = fabModifier)
        return
    }
    val latest by rememberUpdatedState(onClick)
    val owner = remember { Any() }
    DisposableEffect(host, icon, label) {
        host.owner = owner
        host.action = NavAction(icon, label) { latest() }
        onDispose {
            if (host.owner === owner) {
                host.owner = null
                host.action = null
            }
        }
    }
}
