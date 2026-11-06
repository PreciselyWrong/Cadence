package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.ProjectImage
import ch.nicolab.cadence.tasks.sync.ServerSession
import coil3.compose.AsyncImage
import coil3.network.NetworkHeaders
import coil3.network.httpHeaders
import coil3.request.ImageRequest
import coil3.request.crossfade

private val BannerHeight = 140.dp

/** Bannière d'un projet : rien sans image, ni quand elle ne se charge pas (hors ligne, jamais lue). */
@Composable
internal fun ProjectBanner(imageUrl: String?) {
    if (imageUrl.isNullOrBlank()) return
    val context = LocalContext.current
    val session by produceState<ServerSession?>(null, context) { value = TasksGraph.serverSession(context) }
    val server = session ?: return
    val source = remember(server, imageUrl) { ProjectImage.source(server.baseUrl, imageUrl) } ?: return
    var failed by remember(source) { mutableStateOf(false) }
    if (failed) return
    val request = remember(source, server) {
        ImageRequest.Builder(context)
            .data(source.url)
            .apply {
                if (source.sendToken) {
                    httpHeaders(NetworkHeaders.Builder().set("Authorization", "Bearer ${server.token}").build())
                }
            }
            .crossfade(true)
            .build()
    }
    AsyncImage(
        model = request,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        onError = { failed = true },
        modifier = Modifier
            .padding(start = Space.md, end = Space.md, bottom = Space.sm)
            .fillMaxWidth()
            .height(BannerHeight)
            .clip(Radius.Card),
    )
}
