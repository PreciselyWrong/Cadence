package ch.nicolab.cadence.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.cadence

private const val PRESS_TINT_ALPHA = 0.07f

/**
 * État pressé d'une surface cliquable : réduction à [Motion.PRESS_SCALE] et voile de teinte,
 * découpés à [shape]. À poser avant le fond de la surface, avec la même [interactionSource]
 * que son `clickable` (et `indication = null` pour ne pas doubler l'ondulation).
 */
@Composable
fun Modifier.pressable(
    interactionSource: InteractionSource,
    shape: Shape = RectangleShape,
): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) Motion.PRESS_SCALE else 1f, Motion.quick(), label = "pressScale")
    val tint by animateColorAsState(
        if (pressed) cadence.onSurface.copy(alpha = PRESS_TINT_ALPHA) else Color.Transparent,
        Motion.quick(),
        label = "pressTint",
    )
    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
            this.shape = shape
            clip = shape != RectangleShape
        }
        .drawWithContent {
            drawContent()
            drawRect(tint)
        }
}
