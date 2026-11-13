package ch.nicolab.cadence.tasks.plugins

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

/**
 * Entrées de menu des plugins actifs : la dernière réponse gardée d'abord (hors ligne), relue du serveur à chaque
 * changement de [refreshKey] (ouverture du sélecteur de listes). Sans serveur, la liste se vide.
 */
@Composable
internal fun rememberPluginMenu(refreshKey: Any?): PluginMenu {
    val context = LocalContext.current
    val store = remember(context) { PluginsStore.of(context) }
    var menu by remember { mutableStateOf(store.menu()) }
    LaunchedEffect(refreshKey) {
        pluginsClient(context).menu()
            .onSuccess {
                menu = it
                store.saveMenu(it)
            }
            .onFailure {
                if (it is NotConnected) {
                    menu = PluginMenu.EMPTY
                    store.saveMenu(PluginMenu.EMPTY)
                }
            }
    }
    return menu
}
