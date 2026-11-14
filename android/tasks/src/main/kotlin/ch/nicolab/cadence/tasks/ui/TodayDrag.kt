package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.lazy.LazyListItemInfo
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.compose.runtime.Composable
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.tasks.planning.TodayDrop
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Glisser d'Aujourd'hui : un appui long soulève la ligne, elle suit le doigt, et la place où elle tombe se lit entre les
 * deux lignes visibles qui l'entourent ([TodayDrop]). Lâchée sans avoir bougé, elle ouvre son menu, comme avant.
 */
@Stable
internal class TodayDragState(val list: LazyListState) {
    /** Clé de la ligne soulevée ; null hors d'un glisser. */
    var key: Any? by mutableStateOf(null)
        private set
    var offset by mutableFloatStateOf(0f)
        private set
    private var moved = 0f

    /** Lignes voisines de la place où la ligne tomberait, et le bord entre elles (px depuis le haut de la liste). */
    var above: Any? by mutableStateOf(null)
        private set
    var below: Any? by mutableStateOf(null)
        private set
    var lineY by mutableFloatStateOf(Float.NaN)
        private set

    fun start(key: Any) {
        this.key = key
        offset = 0f
        moved = 0f
        locate()
    }

    fun drag(dy: Float) {
        offset += dy
        moved += kotlin.math.abs(dy)
        locate()
    }

    /** Fin du geste : vrai si la ligne a vraiment bougé (sinon c'était un appui long). */
    fun end(): Boolean {
        val wasMoved = moved > MIN_MOVE_PX
        key = null
        offset = 0f
        lineY = Float.NaN
        return wasMoved
    }

    private fun locate() {
        val items = list.layoutInfo.visibleItemsInfo
        val dragged = items.firstOrNull { it.key == key } ?: return
        val center = dragged.offset + offset + dragged.size / 2f
        val others = items.filter { it.key != key }
        val belowIndex = others.indexOfFirst { it.offset + it.size / 2f > center }.let { if (it == -1) others.size else it }
        val aboveItem: LazyListItemInfo? = others.getOrNull(belowIndex - 1)
        val belowItem: LazyListItemInfo? = others.getOrNull(belowIndex)
        above = aboveItem?.key
        below = belowItem?.key
        lineY = (belowItem?.offset ?: aboveItem?.let { it.offset + it.size } ?: 0).toFloat()
    }

    private companion object {
        const val MIN_MOVE_PX = 12f
    }
}

/**
 * La ligne de clé [key] se soulève sur un appui long et suit le doigt. Lu avant la ligne elle-même : ni le toucher, ni
 * le glissement latéral, ni le défilement ne partent une fois soulevée. [onMenu] au relâcher sans mouvement.
 */
@Composable
internal fun Modifier.todayDraggable(state: TodayDragState, key: Any, onDrop: () -> Unit, onMenu: () -> Unit): Modifier {
    val timeout = LocalViewConfiguration.current.longPressTimeoutMillis
    val slop = LocalViewConfiguration.current.touchSlop
    val lifted = state.key == key
    val drop by rememberUpdatedState(onDrop)
    val menu by rememberUpdatedState(onMenu)
    return this
        .zIndex(if (lifted) 1f else 0f)
        .graphicsLayer { translationY = if (lifted) state.offset else 0f }
        .then(if (lifted) Modifier.shadow(8.dp, Radius.Control) else Modifier)
        .pointerInput(key) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                // Appui tenu sans bouger : sinon c'est un toucher, un défilement ou un glissement latéral.
                val released = withTimeoutOrNull(timeout) {
                    while (true) {
                        val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id }
                            ?: return@withTimeoutOrNull true
                        if (!change.pressed || (change.position - down.position).getDistance() > slop) return@withTimeoutOrNull true
                    }
                    @Suppress("UNREACHABLE_CODE")
                    true
                }
                if (released != null) return@awaitEachGesture
                state.start(key)
                while (true) {
                    val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id }
                    if (change == null) {
                        state.end()
                        return@awaitEachGesture
                    }
                    val dy = change.positionChange().y
                    // Consommé avant la ligne et la liste : pas de toucher au relâcher, pas de défilement.
                    change.consume()
                    if (!change.pressed) {
                        if (state.end()) drop() else menu()
                        return@awaitEachGesture
                    }
                    state.drag(dy)
                }
            }
        }
}

/** Ce que [TodayDrop] lit d'une ligne de la liste, par sa clé. */
internal typealias TodayDropRows = Map<Any, TodayDrop.Row>
