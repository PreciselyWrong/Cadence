package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Dégradé du fond sous la barre de navigation système (3 boutons ou geste) : le contenu qui
 * défile s'estompe avant elle au lieu de passer sous ses icônes. À poser au-dessus du contenu
 * et sous la navigation flottante.
 */
@Composable
fun BoxScope.NavigationBarScrim() {
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val background = cadence.background
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .height(bottom + Space.lg)
            .background(
                Brush.verticalGradient(
                    listOf(Color.Transparent, background.copy(alpha = Glass.SystemScrimAlpha), background.copy(alpha = Glass.SystemScrimAlpha)),
                ),
            ),
    )
}

/**
 * Fond d'un en-tête de section collant : opaque sous le texte, fondu vers le contenu qui
 * défile dessous, pour que les lignes ne se superposent jamais au titre.
 */
@Composable
fun Modifier.stickyScrim(): Modifier {
    val background = cadence.background
    return background(
        Brush.verticalGradient(
            listOf(background, background.copy(alpha = Glass.SystemScrimAlpha), background.copy(alpha = 0f)),
        ),
    )
}
