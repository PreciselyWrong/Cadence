package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.links.CachedPreview
import ch.nicolab.cadence.tasks.links.TaskLink
import ch.nicolab.cadence.tasks.model.TaskSources
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlinx.coroutines.flow.flowOf

/** L'aperçu en cache de la page d'une tâche (Room, hors ligne), rafraîchi par le serveur au besoin. */
@Composable
internal fun rememberLinkPreview(url: String?): CachedPreview? {
    val context = LocalContext.current
    val previews = remember(context) { TasksGraph.linkPreviews(context) }
    val preview by remember(url) { url?.let(previews::observe) ?: flowOf(null) }
        .collectAsStateWithLifecycle(initialValue = null)
    LaunchedEffect(url) { url?.let { previews.ensure(it) } }
    return preview?.takeUnless { it.failed }
}

/** Le site d'une tâche-lien à la place de l'adresse brute : son icône (sauf si la pastille d'origine la montre) et son nom. */
@Composable
internal fun SiteLine(link: TaskLink, siteName: String?, modifier: Modifier = Modifier) {
    val palette = cadence
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (!link.iconInBadge) SiteIcon(TaskSources.faviconPath(link.url), size = 14.dp) {}
        Text(
            siteName?.trim()?.takeIf { it.isNotEmpty() } ?: link.host,
            style = MaterialTheme.typography.labelMedium,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** L'image de la page au format 1,91:1 des images partagées par les sites ; rien sans image ou si elle ne se charge pas. */
@Composable
internal fun LinkThumb(imageUrl: String?, modifier: Modifier = Modifier.size(width = 64.dp, height = 34.dp)) {
    val image = imageUrl ?: return
    var failed by remember(image) { mutableStateOf(false) }
    if (failed) return
    val context = LocalContext.current
    AsyncImage(
        model = remember(image) { ImageRequest.Builder(context).data(image).crossfade(true).build() },
        contentDescription = null,
        contentScale = ContentScale.Crop,
        onError = { failed = true },
        modifier = modifier.clip(RoundedCornerShape(6.dp)).background(cadence.containerHigh),
    )
}
