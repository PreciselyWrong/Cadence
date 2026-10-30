package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.glass
import ch.nicolab.cadence.designsystem.theme.glassBorder

/** Style d'un bouton d'en-tête : verre sur les écrans principaux, nu sur le détail, plein pour l'action principale. */
enum class HeaderButtonStyle { Glass, Plain, Filled }

/** Bouton circulaire d'en-tête, cible tactile de 48 dp et retour physique au toucher. */
@Composable
fun RoundHeaderButton(
    icon: ImageVector,
    contentDescription: String,
    modifier: Modifier = Modifier,
    style: HeaderButtonStyle = HeaderButtonStyle.Glass,
    onClick: () -> Unit,
) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) Motion.PRESS_SCALE else 1f,
        animationSpec = Motion.interactive(),
        label = "roundHeaderButtonPress",
    )
    val fill = when (style) {
        HeaderButtonStyle.Glass -> palette.glass
        HeaderButtonStyle.Plain -> Color.Transparent
        HeaderButtonStyle.Filled -> palette.primary
    }
    val tint = if (style == HeaderButtonStyle.Filled) palette.onPrimary else palette.onSurface
    val outline = if (style == HeaderButtonStyle.Glass) {
        Modifier.border(Size.hairline, palette.glassBorder, CircleShape)
    } else {
        Modifier
    }
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .size(Size.headerButton)
            .clip(CircleShape)
            .background(fill)
            .then(outline)
            .clickable(
                interactionSource = interactionSource,
                indication = LocalIndication.current,
                role = Role.Button,
                onClick = {
                    haptic.tap()
                    onClick()
                },
            )
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(Size.iconLarge))
    }
}
