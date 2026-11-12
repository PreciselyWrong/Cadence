package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkKind
import android.icu.text.CompactDecimalFormat
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Titre, description, domaine, type et chiffres GitHub d'une page, sans l'ouvrir. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LinkSummary(link: LinkItem, descriptionLines: Int) {
    val palette = cadence
    Text(
        link.displayTitle,
        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
        color = palette.onSurface,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
    link.displayDescription?.let {
        Text(
            it,
            style = MaterialTheme.typography.bodySmall,
            color = palette.onSurfaceVariant,
            maxLines = descriptionLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Text(link.domain, style = MaterialTheme.typography.labelSmall, color = palette.outline, maxLines = 1)
        if (link.kind != LinkKind.OTHER) {
            Text(stringResource(kindLabel(link.kind)), style = MaterialTheme.typography.labelSmall, color = palette.primary)
        }
        link.githubStars?.let { stars ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Star, contentDescription = null, tint = palette.outline, modifier = Modifier.size(Size.iconSm))
                Text(
                    starsText(stars),
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.outline,
                )
            }
        }
        link.githubLanguage?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = palette.outline) }
        link.githubLastCommit?.let { pushed ->
            val month = DateTimeFormatter.ofPattern("MMM yyyy", Locale.getDefault()).format(pushed.atZone(ZoneId.systemDefault()))
            Text(stringResource(R.string.links_last_commit, month), style = MaterialTheme.typography.labelSmall, color = palette.outline)
        }
        if (link.fetching) {
            Text(stringResource(R.string.links_fetching), style = MaterialTheme.typography.labelSmall, color = palette.outline)
        }
    }
}

private fun kindLabel(kind: LinkKind): Int = when (kind) {
    LinkKind.REPO -> R.string.links_kind_repo
    LinkKind.ARTICLE -> R.string.links_kind_article
    LinkKind.VIDEO -> R.string.links_kind_video
    LinkKind.TOOL -> R.string.links_kind_tool
    LinkKind.OTHER -> R.string.links_kind_other
}

/** Nombre d'étoiles court (« 1,2 k »), dans la langue de l'appareil. */
internal fun starsText(stars: Int): String =
    CompactDecimalFormat.getInstance(Locale.getDefault(), CompactDecimalFormat.CompactStyle.SHORT).format(stars)
