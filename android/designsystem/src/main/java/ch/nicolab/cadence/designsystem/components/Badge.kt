package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/** Ton sémantique d'une pastille. */
enum class BadgeTone { Neutral, Primary, Success, Warning, Error }

/**
 * Pastille d'information : date, projet, état. Une couleur de projet ou de calendrier remplace
 * le ton sémantique ; son texte est ajusté jusqu'à 4,5:1 sur la teinte à 16 %.
 */
@Composable
fun CadenceBadge(
    text: String,
    modifier: Modifier = Modifier,
    tone: BadgeTone = BadgeTone.Neutral,
    icon: ImageVector? = null,
    color: Color? = null,
) {
    val palette = cadence
    val (container, content) = if (color != null) {
        // Le texte garde la couleur du projet ou de l'agenda, ajustée jusqu'à 4,5:1 sur la pastille.
        val pill = color.copy(alpha = Glass.BadgeAlpha)
        pill to readableTintOf(color, tintedSurface(color, Glass.BadgeAlpha, palette.card))
    } else {
        when (tone) {
            BadgeTone.Neutral -> palette.surfaceVariant to palette.onSurfaceVariant
            BadgeTone.Primary -> palette.primaryContainer to palette.onPrimaryContainer
            BadgeTone.Success -> palette.successContainer to palette.success
            BadgeTone.Warning -> palette.warningContainer to palette.warning
            BadgeTone.Error -> palette.errorContainer to palette.onErrorContainer
        }
    }
    Row(
        modifier
            .height(Size.badgeHeight)
            .clip(Radius.Pill)
            .background(container)
            .padding(horizontal = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon?.let {
            Icon(it, null, tint = content, modifier = Modifier.size(Size.badgeIcon))
            Spacer(Modifier.width(Space.xs))
        }
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            color = content,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
