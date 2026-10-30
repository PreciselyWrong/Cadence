package ch.nicolab.cadence.designsystem.components

import androidx.compose.runtime.Composable
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
class Backdrop internal constructor(internal val haze: HazeState)

@Composable
fun rememberBackdrop(): Backdrop {
    val state = rememberHazeState()
    return remember(state) { Backdrop(state) }
}

/** Marque le contenu qui passe sous une barre floue. */
fun Modifier.backdropSource(backdrop: Backdrop): Modifier = hazeSource(backdrop.haze)
