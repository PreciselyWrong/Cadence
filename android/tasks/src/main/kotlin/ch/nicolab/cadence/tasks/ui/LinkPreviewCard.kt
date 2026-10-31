package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.designsystem.components.tintedSurface
import ch.nicolab.cadence.designsystem.components.readableTintOf
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import ch.nicolab.cadence.designsystem.theme.HabitColorChoices
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.CachedPreview
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.LinkPreviews

internal enum class PreviewSize { Compact, Large }

private val THUMB = 56.dp
private val IMAGE_RATIO = 1.91f

/**
 * Carte d'aperçu d'un lien : vignette, titre, domaine. Elle s'affiche tout de suite avec le domaine,
 * puis se complète quand le serveur répond ; hors ligne, le cache suffit. Un toucher ouvre le lien.
 */
@Composable
internal fun LinkPreviewCard(
    url: String,
    previews: LinkPreviews,
    modifier: Modifier = Modifier,
    size: PreviewSize = PreviewSize.Compact,
) {
    val preview by remember(url) { previews.observe(url) }.collectAsStateWithLifecycle(initialValue = null)
    LaunchedEffect(url) { previews.ensure(url) }
    val domain = LinkExtractor.domain(url) ?: url
    val uriHandler = LocalUriHandler.current
    val palette = cadence
    val shown = preview?.takeUnless { it.failed }
    val title = shown?.title?.takeIf { it != domain } ?: domain
    val description = if (title == domain) null else domain
    val openLabel = stringResource(R.string.tasks_link_open, domain)
    val large = size == PreviewSize.Large && shown?.imageUrl != null

    Column(
        modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .clickable { runCatching { uriHandler.openUri(url) } }
            .semantics {
                role = Role.Button
                contentDescription = "$openLabel. $title"
            },
    ) {
        if (large) {
            Thumbnail(shown, domain, Modifier.fillMaxWidth().aspectRatio(IMAGE_RATIO), RectangleShape)
            LinkTexts(title, description ?: shown.description, domain, Modifier.padding(Space.md))
        } else {
            Row(
                Modifier.padding(Space.sm),
                horizontalArrangement = Arrangement.spacedBy(Space.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Thumbnail(shown, domain, Modifier.size(THUMB), Radius.Chip)
                LinkTexts(title, description, null, Modifier.weight(1f).padding(end = Space.sm))
            }
        }
    }
}

@Composable
private fun LinkTexts(title: String, subtitle: String?, domain: String?, modifier: Modifier) {
    val palette = cadence
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.groupGap)) {
        Text(
            title,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            color = palette.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        subtitle?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
                maxLines = if (domain != null) 2 else 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        domain?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = palette.outline, maxLines = 1)
        }
    }
}

/** Image du serveur sur une pastille à l'initiale du domaine : elle reste visible si l'image manque. */
@Composable
private fun Thumbnail(preview: CachedPreview?, domain: String, modifier: Modifier, shape: Shape) {
    val context = LocalContext.current
    val tint = remember(domain) { Color(HabitColorChoices[(domain.hashCode() and Int.MAX_VALUE) % HabitColorChoices.size]) }
    Box(modifier.clip(shape).background(tint.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
        Text(
            domain.first().uppercase(),
            style = MaterialTheme.typography.titleLarge,
            color = readableTintOf(tint, tintedSurface(tint, 0.18f, cadence.containerHigh)),
        )
        preview?.imageUrl?.let { image ->
            AsyncImage(
                model = ImageRequest.Builder(context).data(image).crossfade(true).build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        }
    }
}

/** Image seule du premier lien, pour une carte de note ; rien tant que le serveur n'a pas donné d'image. */
@Composable
internal fun LinkThumbStrip(url: String, previews: LinkPreviews, modifier: Modifier = Modifier) {
    val preview by remember(url) { previews.observe(url) }.collectAsStateWithLifecycle(initialValue = null)
    LaunchedEffect(url) { previews.ensure(url) }
    val shown = preview?.takeUnless { it.failed || it.imageUrl == null } ?: return
    Thumbnail(shown, LinkExtractor.domain(url) ?: url, modifier.fillMaxWidth().aspectRatio(IMAGE_RATIO), Radius.Chip)
}

/** Jusqu'à [limit] cartes pour les liens de [text] ; rien s'il n'y en a pas. */
@Composable
internal fun LinkPreviewList(
    text: String,
    previews: LinkPreviews,
    modifier: Modifier = Modifier,
    size: PreviewSize = PreviewSize.Compact,
    limit: Int = 3,
) {
    val urls = remember(text, limit) { LinkExtractor.urls(text, limit) }
    if (urls.isEmpty()) return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        urls.forEach { url -> LinkPreviewCard(url, previews, size = size) }
    }
}
