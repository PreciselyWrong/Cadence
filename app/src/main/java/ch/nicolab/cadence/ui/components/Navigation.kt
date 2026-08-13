package ch.nicolab.cadence.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.ui.theme.Elevation
import ch.nicolab.cadence.ui.theme.Motion
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence

data class NavDestination(val label: String, val icon: ImageVector)

/**
 * Navigation flottante en capsule sombre : c'est l'élément le plus reconnaissable de
 * l'application. Les destinations inactives restent compactes et iconiques, la destination
 * active s'ouvre en capsule accentuée portant icône et libellé.
 */
@Composable
fun CadenceNavigation(
    destinations: List<NavDestination>,
    selected: Int,
    modifier: Modifier = Modifier,
    onSelect: (Int) -> Unit,
) {
    val palette = cadence
    Box(modifier.padding(horizontal = Space.gutter).navigationBarsPadding().padding(bottom = Space.md)) {
        Surface(
            shape = Radius.Pill,
            color = palette.structural,
            contentColor = palette.onStructural,
            shadowElevation = Elevation.floating,
        ) {
            Row(
                Modifier.height(Size.navBar).padding(horizontal = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.xs),
            ) {
                destinations.forEachIndexed { index, destination ->
                    NavItem(destination, index == selected) { onSelect(index) }
                }
            }
        }
    }
}

@Composable
private fun NavItem(destination: NavDestination, active: Boolean, onClick: () -> Unit) {
    val palette = cadence
    val horizontal by animateDpAsState(if (active) Space.lg else Space.md, Motion.normal(), label = "navPad")
    Row(
        Modifier
            .clip(Radius.Pill)
            .background(if (active) palette.accent else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .height(Size.touch)
            .padding(horizontal = horizontal)
            .semantics { contentDescription = destination.label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            destination.icon,
            null,
            tint = if (active) palette.onAccent else palette.onStructuralMuted,
            modifier = Modifier.size(Size.iconLarge),
        )
        AnimatedVisibility(
            visible = active,
            enter = fadeIn(Motion.quick()) + expandHorizontally(Motion.normal()),
            exit = fadeOut(Motion.quick()) + shrinkHorizontally(Motion.normal()),
        ) {
            Row {
                Spacer(Modifier.width(Space.sm))
                Text(destination.label, style = MaterialTheme.typography.labelLarge, color = palette.onAccent)
            }
        }
    }
}

@Composable
internal fun NavPlaceholder() = Spacer(Modifier.size(0.dp))
