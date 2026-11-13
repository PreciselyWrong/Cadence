package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.sync.ServerSession
import coil3.compose.AsyncImage
import coil3.network.NetworkHeaders
import coil3.network.httpHeaders
import coil3.request.ImageRequest

/**
 * L'icône d'un site, lue par le serveur avec la clé ([faviconPath] : `TaskSources.faviconPath`, `/api/links/favicon`) ;
 * [fallback] tant qu'elle manque ou ne se charge pas (hors ligne, site sans icône).
 */
@Composable
internal fun SiteIcon(faviconPath: String?, size: Dp = 14.dp, fallback: @Composable () -> Unit) {
    val path = faviconPath ?: return fallback()
    val context = LocalContext.current
    val session by produceState<ServerSession?>(null, context) { value = TasksGraph.serverSession(context) }
    var failed by remember(path) { mutableStateOf(false) }
    val server = session
    if (server == null || failed) return fallback()
    val request = remember(path, server) {
        ImageRequest.Builder(context)
            .data(server.baseUrl.trimEnd('/') + path)
            .httpHeaders(NetworkHeaders.Builder().set("Authorization", "Bearer ${server.token}").build())
            .build()
    }
    AsyncImage(
        model = request,
        contentDescription = null,
        onError = { failed = true },
        modifier = Modifier.size(size).clip(RoundedCornerShape(3.dp)),
    )
}
