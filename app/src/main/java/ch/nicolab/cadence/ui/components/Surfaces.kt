package ch.nicolab.cadence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.ui.theme.Elevation
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence

/**
 * Niveau 1 — fond de tout écran. Fournit explicitement fond et couleur de contenu
 * afin qu'aucune surface Compose ne repose directement sur la fenêtre système.
 */
@Composable
fun CadenceScreen(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val palette = cadence
    Surface(modifier.fillMaxSize(), color = palette.background, contentColor = palette.ink) {
        Box(Modifier.fillMaxSize(), content = content)
    }
}

/**
 * Niveau 2 — grande surface fonctionnelle. Pas de bordure : la séparation vient du
 * contraste de surface. L'ombre n'apparaît que si la surface est réellement au-dessus.
 */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    shape: Shape = Radius.Card,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    floating: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val palette = cadence
    val interactive = if (onClick != null || onLongClick != null) {
        Modifier.combinedClickable(onClick = onClick ?: {}, onLongClick = onLongClick)
    } else {
        Modifier
    }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = shape,
        color = palette.surface,
        contentColor = palette.ink,
        shadowElevation = if (floating) Elevation.floating else Elevation.flat,
        tonalElevation = Elevation.flat,
    ) {
        Column(Modifier.then(interactive).padding(Space.lg), content = content)
    }
}

/**
 * En-tête de page intégré à la composition : contexte discret, titre fort,
 * action contextuelle dans une pastille circulaire.
 */
@Composable
fun PageHeader(
    context: String,
    title: String,
    action: (@Composable () -> Unit)? = null,
) {
    val palette = cadence
    Row(Modifier.fillMaxWidth().padding(top = Space.xl, bottom = Space.lg), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(context, style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
            Spacer(Modifier.height(Space.xs))
            Text(title, style = MaterialTheme.typography.headlineMedium, color = palette.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        action?.invoke()
    }
}

/** Bouton iconique d'en-tête : pastille circulaire nettement distincte du fond. */
@Composable
fun HeaderAction(icon: ImageVector, description: String, accent: Boolean = false, onClick: () -> Unit) {
    val palette = cadence
    Box(
        Modifier
            .size(Size.touch)
            .clip(CircleShape)
            .background(if (accent) palette.accent else palette.surface)
            .clickable(onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = if (accent) palette.onAccent else palette.ink, modifier = Modifier.size(Size.iconLarge))
    }
}

/** Titre de groupe dans une liste : rythme la lecture sans créer de surface. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) = Text(
    text,
    modifier.padding(top = Space.lg, bottom = Space.xs),
    style = MaterialTheme.typography.labelMedium,
    color = cadence.inkFaint,
)

/** Séparateur presque invisible, employé seulement à l'intérieur d'une surface. */
@Composable
fun Hairline(modifier: Modifier = Modifier) = Box(
    modifier.fillMaxWidth().height(1.dp).background(cadence.hairline),
)

/**
 * Largeur de lecture bornée : sur tablette et grand écran, la composition se centre
 * au lieu d'étirer les surfaces.
 */
@Composable
fun ReadableColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) = Box(
    modifier.fillMaxWidth(),
    contentAlignment = Alignment.TopCenter,
) {
    Column(Modifier.widthIn(max = 560.dp), content = content)
}

/** Métrique : chiffre dominant, libellé discret dessous. */
@Composable
fun Metric(value: String, label: String, modifier: Modifier = Modifier) = Column(modifier) {
    Text(value, style = ch.nicolab.cadence.ui.theme.MetricStyle, color = cadence.ink)
    Text(label, style = MaterialTheme.typography.labelMedium, color = cadence.inkFaint)
}

/** État vide : petit repère visuel, titre court, explication courte, action éventuelle. */
@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    message: String,
    action: (@Composable () -> Unit)? = null,
) {
    val palette = cadence
    Panel {
        Box(Modifier.size(44.dp).clip(Radius.Chip).background(palette.accentSoft), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = palette.accent, modifier = Modifier.size(Size.icon))
        }
        Spacer(Modifier.height(Space.md))
        Text(title, style = MaterialTheme.typography.titleMedium, color = palette.ink)
        Spacer(Modifier.height(Space.xs))
        Text(message, style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
        action?.let { Spacer(Modifier.height(Space.lg)); Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) { it() } }
    }
}

/** Espace réservé sous le contenu pour que la navigation flottante ne masque rien. */
@Composable
fun NavigationSpacer() = Spacer(Modifier.height(Size.navBar + Space.xxl))

@Composable
internal fun HorizontalGap(width: androidx.compose.ui.unit.Dp) = Spacer(Modifier.width(width))
