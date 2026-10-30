package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Elevation
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Niveau 1 - fond de tout écran. Fournit explicitement fond et couleur de contenu
 * afin qu'aucune surface Compose ne repose directement sur la fenêtre système.
 */
@Composable
fun CadenceScreen(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val palette = cadence
    Surface(modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Box(Modifier.fillMaxSize(), content = content)
    }
}

/**
 * Niveau 2 - grande surface fonctionnelle. Pas de bordure : la séparation vient du
 * contraste de surface. L'ombre n'apparaît que si la surface est réellement au-dessus.
 * Répond immédiatement au toucher (pointer-down) par une compression discrète amortie.
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
    val isInteractive = onClick != null || onLongClick != null
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && isInteractive) 0.985f else 1f,
        animationSpec = Motion.interactive(),
        label = "panelPress",
    )
    val haptic = rememberCadenceHaptic()
    val interactive = if (isInteractive) {
        Modifier.combinedClickable(
            interactionSource = interactionSource,
            indication = androidx.compose.foundation.LocalIndication.current,
            onClick = onClick ?: {},
            onLongClick = onLongClick?.let { action ->
                {
                    haptic.longPress()
                    action()
                }
            },
        )
    } else {
        Modifier
    }
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (isInteractive) Modifier.graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                } else Modifier
            ),
        shape = shape,
        color = palette.card,
        contentColor = palette.onSurface,
        shadowElevation = if (floating) Elevation.floating else Elevation.flat,
        tonalElevation = Elevation.flat,
    ) {
        Column(Modifier.then(interactive).padding(horizontal = Space.lg, vertical = Space.md), content = content)
    }
}

/** Séparateur presque invisible, employé seulement à l'intérieur d'une surface. */
@Composable
fun Hairline(modifier: Modifier = Modifier) = Box(
    modifier.fillMaxWidth().height(1.dp).background(cadence.outlineVariant),
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
    Text(value, style = ch.nicolab.cadence.designsystem.theme.MetricStyle, color = cadence.onSurface)
    Text(label, style = MaterialTheme.typography.labelMedium, color = cadence.outline)
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
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Space.lg, vertical = Space.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(palette.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = palette.primary, modifier = Modifier.size(Size.iconLarge))
        }
        Spacer(Modifier.height(Space.lg))
        Text(title, style = MaterialTheme.typography.titleMedium, color = palette.onSurface, textAlign = TextAlign.Center)
        Spacer(Modifier.height(Space.xs))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant, textAlign = TextAlign.Center)
        action?.let {
            Spacer(Modifier.height(Space.xl))
            it()
        }
    }
}

/**
 * Hauteur verticale occupée par la barre de navigation flottante, inset système inclus.
 * Le contenu qui défile dessous s'y arrête pour rester atteignable.
 */
@Composable
fun navigationClearance(): Dp =
    WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + Size.navBar + Space.sm

/** Espace réservé sous le contenu pour que la navigation flottante ne masque rien. */
@Composable
fun NavigationSpacer() = Spacer(Modifier.height(navigationClearance() + Space.lg))

@Composable
internal fun HorizontalGap(width: androidx.compose.ui.unit.Dp) = Spacer(Modifier.width(width))

/**
 * Tuile de métrique statistique structurée avec icône thématique et couleur d'accent.
 */
@Composable
fun MetricCard(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    iconTint: Color = cadence.onSurfaceVariant,
    valueColor: Color = cadence.onSurface,
) {
    val palette = cadence
    Column(
        modifier = modifier
            .clip(Radius.Chip)
            .background(palette.card)
            .padding(horizontal = Space.md, vertical = Space.sm),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                color = valueColor,
                maxLines = 1,
            )
            icon?.let {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(Size.iconSm),
                )
            }
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
