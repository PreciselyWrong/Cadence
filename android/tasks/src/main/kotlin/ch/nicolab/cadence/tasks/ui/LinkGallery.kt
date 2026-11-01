package ch.nicolab.cadence.tasks.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.content.edit
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.LinkDecision
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkKind
import ch.nicolab.cadence.tasks.model.LinkTriage
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade

/** Liste ou galerie, retenu par écran (« links », « notes ») sur l'appareil seulement. */
internal class LayoutStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isGallery(screen: String): Boolean = prefs.getBoolean(screen, false)

    fun setGallery(screen: String, gallery: Boolean) = prefs.edit { putBoolean(screen, gallery) }

    private companion object {
        const val PREFS = "cadence_layouts"
    }
}

private fun galleryLabel(decision: LinkDecision): Int = when (decision) {
    LinkDecision.TEST -> R.string.links_gallery_test
    LinkDecision.ATTACH -> R.string.links_gallery_attach
    LinkDecision.LATER -> R.string.links_gallery_later
    LinkDecision.DROP -> R.string.links_action_dropped
    LinkDecision.KEEP -> R.string.links_action_kept
}

/**
 * Carte de la galerie des découvertes : l'image de la page quand le serveur l'a lue, le titre, le site et les
 * étoiles, le début du README pour un dépôt (sinon la description), puis les décisions d'un toucher
 * (Tester, Rattacher, Reporter, Jeter). Toucher la carte ouvre le lien.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LinkGalleryCard(link: LinkItem, onDecide: (LinkDecision) -> Unit, modifier: Modifier = Modifier) {
    val palette = cadence
    val uriHandler = LocalUriHandler.current
    Column(modifier.fillMaxWidth().clip(Radius.Card).background(palette.card)) {
        Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { runCatching { uriHandler.openUri(link.url) } }) {
            link.imageUrl?.let { GalleryImage(it) }
            Column(
                Modifier.padding(start = Space.md, end = Space.md, top = Space.md),
                verticalArrangement = Arrangement.spacedBy(Space.xs),
            ) {
                Text(
                    link.displayTitle,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = palette.onSurface,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                GalleryMeta(link)
                val excerpt = link.readmeExcerpt?.takeIf { link.kind == LinkKind.REPO && it.isNotBlank() } ?: link.displayDescription
                excerpt?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.onSurfaceVariant,
                        maxLines = EXCERPT_LINES,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                link.note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            }
        }
        FlowRow(
            Modifier.fillMaxWidth().padding(Space.md),
            horizontalArrangement = Arrangement.spacedBy(Space.xs),
            verticalArrangement = Arrangement.spacedBy(Space.xs),
        ) {
            LinkTriage.GALLERY_DECISIONS.forEach { decision ->
                QuickPill(
                    label = stringResource(galleryLabel(decision)),
                    onClick = { onDecide(decision) },
                    quiet = decision == LinkDecision.LATER || decision == LinkDecision.DROP,
                )
            }
        }
    }
}

private const val EXCERPT_LINES = 4

/** Site, étoiles GitHub et statut déjà choisi, sur une ligne qui passe à la ligne si la colonne est étroite. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GalleryMeta(link: LinkItem) {
    val palette = cadence
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Text(link.domain, style = MaterialTheme.typography.labelSmall, color = palette.outline, maxLines = 1, overflow = TextOverflow.Ellipsis)
        link.githubStars?.let { stars ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Star, contentDescription = null, tint = palette.outline, modifier = Modifier.size(Size.iconSm))
                Text(starsText(stars), style = MaterialTheme.typography.labelSmall, color = palette.outline)
            }
        }
        statusLabel(link.status)?.let { Text(stringResource(it), style = MaterialTheme.typography.labelSmall, color = palette.primary) }
    }
}

/** Image servie par le serveur (`image_url`), chargée par Coil ; rien du tout si elle ne se charge pas. */
@Composable
internal fun GalleryImage(url: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var failed by remember(url) { mutableStateOf(false) }
    if (failed) return
    AsyncImage(
        model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        onError = { failed = true },
        modifier = modifier.fillMaxWidth().aspectRatio(LINK_IMAGE_RATIO),
    )
}
