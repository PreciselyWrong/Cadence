package ch.nicolab.cadence.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.ui.theme.Elevation
import ch.nicolab.cadence.ui.theme.Motion
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence

data class NavDestination(val label: String, val icon: ImageVector, val shortLabel: String = label)

/**
 * Navigation flottante en capsule sombre : c'est l'élément le plus reconnaissable de
 * l'application. Les destinations inactives restent compactes et iconiques, la destination
 * active porte son icône et son libellé sans modifier la largeur de sa cible.
 */
@Composable
fun CadenceNavigation(
    destinations: List<NavDestination>,
    selected: Int,
    modifier: Modifier = Modifier,
    onSelect: (Int) -> Unit,
) {
    val palette = cadence
    Box(modifier.fillMaxWidth().navigationBarsPadding()) {
        Box(
            Modifier.matchParentSize().background(
                Brush.verticalGradient(listOf(palette.background.copy(alpha = 0f), palette.background))
            )
        )
        Surface(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.md),
            shape = Radius.Pill,
            color = palette.structural,
            contentColor = palette.onStructural,
            shadowElevation = Elevation.floating,
        ) {
            Row(
                Modifier.fillMaxWidth().height(Size.navBar).padding(horizontal = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                destinations.forEachIndexed { index, destination ->
                    NavItem(destination, index == selected, Modifier.weight(1f)) { onSelect(index) }
                }
            }
        }
    }
}

@Composable
private fun NavItem(destination: NavDestination, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val background by animateColorAsState(
        targetValue = if (active) palette.accent else Color.Transparent,
        animationSpec = Motion.quick(),
        label = "navBackground",
    )
    val iconTint by animateColorAsState(
        targetValue = if (active) palette.onAccent else palette.onStructuralMuted,
        animationSpec = Motion.quick(),
        label = "navIconTint",
    )
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.94f else 1f,
        animationSpec = Motion.interactive(),
        label = "navPress",
    )
    Box(modifier.height(Size.navBar), contentAlignment = Alignment.Center) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Space.xs)
                .height(42.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .clip(Radius.Pill)
                .background(background)
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = {
                        if (!active) haptic.tap()
                        onClick()
                    },
                )
                .semantics { contentDescription = destination.label },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                destination.icon,
                null,
                tint = iconTint,
                modifier = Modifier.size(if (active) Size.iconSm else Size.iconLarge),
            )
            if (active) {
                Spacer(Modifier.height(2.dp))
                Text(
                    destination.shortLabel,
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                    color = palette.onAccent,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
