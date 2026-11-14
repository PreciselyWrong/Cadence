package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Elevation
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.glassBorder
import ch.nicolab.cadence.designsystem.theme.glassSelected
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

data class NavDestination(val label: String, val icon: ImageVector, val selectedIcon: ImageVector = icon)

/**
 * Navigation flottante en capsule translucide. Le contenu défile dessous : sous Android 12+
 * il est flouté par [backdrop], ailleurs la teinte seule assure la lisibilité.
 */
@Composable
fun CadenceNavigation(
    destinations: List<NavDestination>,
    selected: Int,
    modifier: Modifier = Modifier,
    backdrop: Backdrop? = null,
    /** Bouton « ajouter » de l'onglet ouvert, rond, au centre de l'île entre les onglets ; aucun s'il est null. */
    action: NavAction? = null,
    onSelect: (Int) -> Unit,
) {
    val palette = cadence
    val barAlpha = if (palette.isDark) Glass.BarAlphaDark else Glass.BarAlphaLight
    val tint = palette.background.copy(alpha = barAlpha)
    val surface = if (backdrop != null) {
        Modifier.hazeEffect(
            state = backdrop.haze,
            style = HazeStyle(
                backgroundColor = palette.background,
                tint = HazeTint(tint),
                blurRadius = Glass.blur,
                fallbackTint = HazeTint(palette.background.copy(alpha = Glass.FallbackAlpha)),
            ),
        )
    } else {
        Modifier.background(tint)
    }
    Row(
        modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(start = Space.gutter, end = Space.gutter, bottom = Space.sm)
            .shadow(Elevation.floating, Radius.Pill)
            .clip(Radius.Pill)
            .then(surface)
            .border(Size.hairline, palette.glassBorder, Radius.Pill)
            .height(Size.navBar)
            .padding(horizontal = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        val middle = (destinations.size + 1) / 2
        destinations.forEachIndexed { index, destination ->
            if (index == middle) action?.let { NavAddButton(it) }
            NavItem(destination, index == selected, Modifier.weight(1f)) { onSelect(index) }
        }
    }
}

/**
 * Le + de l'onglet ouvert, au centre de la barre : une bulle de verre teintée à l'accent (le flou de la barre passe au
 * travers), un reflet en haut et un liseré clair ; elle s'enfonce un peu sous le doigt.
 */
@Composable
private fun NavAddButton(action: NavAction) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.90f else 1f, Motion.interactive(), label = "navAddPress")
    Box(
        Modifier
            .padding(start = Space.xs, end = Space.xs)
            .size(Size.navItem + Space.xs)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(CircleShape)
            .background(
                androidx.compose.ui.graphics.Brush.verticalGradient(
                    listOf(
                        palette.primary.copy(alpha = Glass.AddAlpha * 0.85f),
                        palette.primary.copy(alpha = Glass.AddAlpha),
                    ),
                ),
            )
            .drawBehind {
                // Reflet doux en haut à gauche, relatif à la taille de la bulle.
                drawCircle(
                    androidx.compose.ui.graphics.Brush.radialGradient(
                        listOf(Color.White.copy(alpha = 0.30f), Color.Transparent),
                        center = androidx.compose.ui.geometry.Offset(size.width * 0.35f, size.height * 0.22f),
                        radius = size.minDimension * 0.55f,
                    ),
                )
            }
            .border(Size.hairline, Color.White.copy(alpha = 0.35f), CircleShape)
            .clickable(interactionSource = interactionSource, indication = null, role = Role.Button, onClickLabel = action.label) {
                haptic.tap()
                action.onClick()
            }
            .semantics { contentDescription = action.label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(action.icon, contentDescription = null, tint = palette.onPrimary, modifier = Modifier.size(Size.iconLarge))
    }
}

@Composable
private fun NavItem(destination: NavDestination, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val container by animateColorAsState(
        // Onglet choisi en verre teinté, comme la barre : le contenu reste deviné dessous.
        targetValue = if (active) palette.glassSelected else Color.Transparent,
        animationSpec = Motion.color(),
        label = "navContainer",
    )
    val content by animateColorAsState(
        targetValue = if (active) palette.primary else palette.onSurfaceVariant,
        animationSpec = Motion.color(),
        label = "navContent",
    )
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) Motion.PRESS_SCALE else 1f,
        animationSpec = Motion.interactive(),
        label = "navPress",
    )
    // Onglet choisi : une petite pastille de verre derrière l'icône seule (pas un bloc qui touche le bord de l'île),
    // le libellé passe à l'accent.
    Column(
        modifier
            .height(Size.navItem + Space.sm)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(Radius.Pill)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Tab,
                onClick = {
                    if (!active) haptic.selection()
                    onClick()
                },
            )
            .semantics { selected = active },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier
                .size(width = 52.dp, height = 28.dp)
                .clip(Radius.Pill)
                .background(container),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (active) destination.selectedIcon else destination.icon,
                contentDescription = null,
                tint = content,
                modifier = Modifier.size(Size.icon),
            )
        }
        Text(
            destination.label,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = if (active) androidx.compose.ui.text.font.FontWeight.SemiBold else null),
            color = content,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}
