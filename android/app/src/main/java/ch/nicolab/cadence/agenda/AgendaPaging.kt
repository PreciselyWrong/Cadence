package ch.nicolab.cadence.agenda

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import ch.nicolab.cadence.designsystem.theme.Motion
import kotlin.math.abs
import kotlinx.coroutines.launch

/** Part de la largeur à franchir pour changer de période. */
private const val PAGE_SWIPE_FRACTION = 0.22f

/** Vitesse (px/s) à partir de laquelle un jet court change de période. */
private const val PAGE_FLING_PX = 1500f
private const val FADE_AT_EDGE = 0.45f

/**
 * Sens du changement de période au relâchement : 1 = suivante (doigt vers la gauche), -1 = précédente,
 * 0 = on reste. Un jet franc dans le sens du glissement vaut le seuil, un jet contraire ne vaut rien.
 */
fun pageSwipeDirection(offsetPx: Float, velocityPx: Float, widthPx: Float): Int {
    if (offsetPx == 0f) return 0
    val direction = if (offsetPx < 0f) 1 else -1
    val travelled = abs(offsetPx) >= widthPx * PAGE_SWIPE_FRACTION
    val sameWay = (offsetPx < 0f) == (velocityPx < 0f)
    val flung = sameWay && abs(velocityPx) >= PAGE_FLING_PX
    return if (travelled || flung) direction else 0
}

/**
 * Enveloppe d'une vue de l'agenda : un glissement horizontal fait suivre le contenu au doigt, puis la
 * période change et la nouvelle entre par le côté opposé. Les gestes enfants (défilement vertical,
 * appui sur un événement, dépôt d'une tâche, bandeau des semaines) passent avant : le glissement
 * ne démarre que sur un mouvement horizontal que personne n'a consommé.
 */
@Composable
internal fun PagedSwipe(
    onSwipe: (Int) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val offset = remember { Animatable(0f) }
    var widthPx by remember { mutableFloatStateOf(0f) }
    val latest by rememberUpdatedState(onSwipe)
    val dragState = rememberDraggableState { delta -> scope.launch { offset.snapTo(offset.value + delta) } }

    Box(
        modifier
            .clipToBounds()
            .onSizeChanged { widthPx = it.width.toFloat() }
            .draggable(
                state = dragState,
                orientation = Orientation.Horizontal,
                onDragStopped = { velocity ->
                    val direction = pageSwipeDirection(offset.value, velocity, widthPx)
                    if (direction == 0) {
                        offset.animateTo(0f, Motion.normal())
                    } else {
                        val exit = if (direction > 0) -widthPx else widthPx
                        offset.animateTo(exit, tween(Motion.QUICK, easing = FastOutLinearInEasing))
                        latest(direction)
                        offset.snapTo(-exit)
                        offset.animateTo(0f, tween(Motion.NORMAL, easing = LinearOutSlowInEasing))
                    }
                },
            ),
    ) {
        Box(
            Modifier.graphicsLayer {
                translationX = offset.value
                alpha = if (widthPx > 0f) 1f - FADE_AT_EDGE * (abs(offset.value) / widthPx).coerceAtMost(1f) else 1f
            },
        ) {
            content()
        }
    }
}
