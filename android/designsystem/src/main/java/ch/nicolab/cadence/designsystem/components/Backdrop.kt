package ch.nicolab.cadence.designsystem.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState

/**
 * Source de flou partagée : le contenu marqué par [backdropSource] est flouté derrière la
 * navigation. Les types Haze restent internes pour ne pas fuir dans l'API publique.
 */
@Stable
class Backdrop internal constructor(internal val haze: HazeState) {
    /** Fonds en verre des modals ouverts, dessinés par [GlassPanels]. */
    internal val panels = mutableStateListOf<GlassPanel>()
}

/** Place et teinte du fond d'un modal ouvert. */
@Stable
internal class GlassPanel(shape: Shape, base: Color, val blur: Dp, val dims: Boolean) {
    var shape by mutableStateOf(shape)
    var base by mutableStateOf(base)
    var bounds by mutableStateOf<Rect?>(null)
    var shift: (() -> Float)? = null
}

@Composable
fun rememberBackdrop(): Backdrop {
    val state = rememberHazeState()
    return remember(state) { Backdrop(state) }
}

/** Marque le contenu qui passe sous une barre floue. */
fun Modifier.backdropSource(backdrop: Backdrop): Modifier = hazeSource(backdrop.haze)
