package ch.nicolab.cadence.tasks.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.SwipeConfig
import ch.nicolab.cadence.tasks.swipe.SwipeSide
import ch.nicolab.cadence.tasks.swipe.SwipeStage
import ch.nicolab.cadence.tasks.swipe.SwipeThresholds
import kotlin.math.abs
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

private const val RESISTANCE_PAST_LONG = 0.45f
private const val MAX_TRAVEL_FRACTION = 0.9f
private const val EXIT_MILLIS = 170
private const val RETURN_DELAY_MILLIS = 260L
private const val ARMED_ICON_SCALE = 1.15f
private const val IDLE_ICON_SCALE = 0.8f
private val MinShortTravel = 72.dp

/**
 * Balayage horizontal d'une ligne à deux seuils par sens. Le fond prend la couleur de l'action
 * atteinte, un retour haptique marque chaque seuil. Une action immédiate fait sortir la ligne,
 * une action à feuille la ramène en place par ressort.
 *
 * [content] reçoit un [Modifier] à poser sur le nœud interactif de la ligne : il porte les
 * actions d'accessibilité, équivalent du geste pour TalkBack.
 */
@Composable
internal fun SwipeActionContainer(
    config: SwipeConfig,
    closed: Boolean,
    onAction: (SwipeAction) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (swipeSemantics: Modifier) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val haptic = rememberCadenceHaptic()
    val offset = remember { Animatable(0f) }
    var widthPx by remember { mutableFloatStateOf(0f) }
    var dragging by remember { mutableStateOf(false) }
    val minShortPx = with(LocalDensity.current) { MinShortTravel.toPx() }
    val currentConfig by rememberUpdatedState(config)
    val currentOnAction by rememberUpdatedState(onAction)

    val side = SwipeSide.of(offset.value)
    val stage = if (side == null) SwipeStage.NONE else SwipeThresholds.stage(offset.value, widthPx, minShortPx)
    val reached = if (side == null) SwipeAction.NONE else config.resolve(side, stage)

    LaunchedEffect(reached) {
        if (dragging && reached != SwipeAction.NONE) haptic.tap()
    }

    val dragState = rememberDraggableState { delta ->
        val limit = widthPx * MAX_TRAVEL_FRACTION
        val current = offset.value
        val longStart = maxOf(widthPx * SwipeThresholds.LONG_FRACTION, minShortPx * 2f)
        val stretched = if (abs(current) >= longStart && (current > 0f) == (delta > 0f)) delta * RESISTANCE_PAST_LONG else delta
        var next = (current + stretched).coerceIn(-limit, limit)
        if (next > 0f && !currentConfig.isEnabled(SwipeSide.RIGHT)) next = 0f
        if (next < 0f && !currentConfig.isEnabled(SwipeSide.LEFT)) next = 0f
        scope.launch { offset.snapTo(next) }
    }

    val actionLabels = config.distinctActions().map { it to stringResource(swipeActionLabelRes(it, closed)) }
    val a11y = Modifier.semantics {
        customActions = actionLabels.map { (action, label) ->
            CustomAccessibilityAction(label) {
                currentOnAction(action)
                true
            }
        }
    }

    Box(modifier.clipToBounds().onSizeChanged { widthPx = it.width.toFloat() }) {
        if (side != null) {
            SwipeBackdrop(
                side = side,
                config = config,
                reached = reached,
                closed = closed,
                modifier = Modifier.matchParentSize(),
            )
        }
        Box(
            Modifier
                .graphicsLayer { translationX = offset.value }
                .draggable(
                    state = dragState,
                    orientation = Orientation.Horizontal,
                    enabled = config.isEnabled(SwipeSide.RIGHT) || config.isEnabled(SwipeSide.LEFT),
                    onDragStarted = { dragging = true },
                    onDragStopped = { velocity ->
                        dragging = false
                        val travelled = offset.value
                        val releaseSide = SwipeSide.of(travelled)
                        val releaseStage = SwipeThresholds.stageOnRelease(travelled, widthPx, velocity, minShortPx)
                        val action = releaseSide?.let { currentConfig.resolve(it, releaseStage) } ?: SwipeAction.NONE
                        when {
                            action == SwipeAction.NONE ->
                                offset.animateTo(0f, spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow))
                            action.opensSheet -> {
                                haptic.confirm()
                                currentOnAction(action)
                                offset.animateTo(0f, spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow))
                            }
                            else -> {
                                haptic.confirm()
                                val exit = if (travelled > 0f) widthPx else -widthPx
                                offset.animateTo(exit, tween(EXIT_MILLIS, easing = FastOutLinearInEasing))
                                currentOnAction(action)
                                // La ligne reste en place si l'action ne la retire pas de la liste (ex. Terminer sur le détail).
                                delay(RETURN_DELAY_MILLIS)
                                offset.animateTo(0f, tween(EXIT_MILLIS))
                            }
                        }
                    },
                ),
        ) {
            content(a11y)
        }
    }
}

@Composable
private fun SwipeBackdrop(
    side: SwipeSide,
    config: SwipeConfig,
    reached: SwipeAction,
    closed: Boolean,
    modifier: Modifier = Modifier,
) {
    val armed = reached != SwipeAction.NONE
    // Avant le premier seuil, l'icône de l'action visée apparaît sur un fond neutre.
    val shown = if (armed) reached else {
        config.actionFor(side, SwipeStage.SHORT).takeIf { it != SwipeAction.NONE } ?: config.actionFor(side, SwipeStage.LONG)
    }
    val (container, ink) = swipeActionColors(if (armed) reached else SwipeAction.NONE)
    val background by animateColorAsState(container, tween(140), label = "swipeBackground")
    val tint by animateColorAsState(if (armed) ink else cadence.onSurfaceVariant, tween(140), label = "swipeTint")
    val scale by animateFloatAsState(
        if (armed) ARMED_ICON_SCALE else IDLE_ICON_SCALE,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "swipeIcon",
    )
    Box(
        modifier.background(background).padding(horizontal = 20.dp),
        contentAlignment = if (side == SwipeSide.RIGHT) Alignment.CenterStart else Alignment.CenterEnd,
    ) {
        val label = stringResource(swipeActionLabelRes(shown, closed))
        val icon = swipeActionIcon(shown, closed)
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (side == SwipeSide.LEFT) {
                Text(label, style = MaterialTheme.typography.labelLarge, color = tint)
                Spacer(Modifier.width(8.dp))
            }
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.graphicsLayer { scaleX = scale; scaleY = scale })
            if (side == SwipeSide.RIGHT) {
                Spacer(Modifier.width(8.dp))
                Text(label, style = MaterialTheme.typography.labelLarge, color = tint)
            }
        }
    }
}
