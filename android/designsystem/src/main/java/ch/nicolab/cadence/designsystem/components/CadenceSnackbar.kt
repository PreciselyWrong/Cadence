package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Elevation
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.glassBorder
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

/**
 * Hôte de messages unique de l'application, installé par la coque. Un écran qui affiche un
 * message l'obtient par [rememberAppSnackbarHostState] et ne pose aucun hôte à lui.
 */
val LocalAppSnackbarHostState = compositionLocalOf<SnackbarHostState?> { null }

/** État d'hôte partagé de l'application ; hors coque (aperçu, activité isolée), un état local. */
@Composable
fun rememberAppSnackbarHostState(): SnackbarHostState =
    LocalAppSnackbarHostState.current ?: remember { SnackbarHostState() }

/**
 * Hôte de bannières en verre : marge latérale de 16 dp, posé par l'appelant au-dessus de la
 * barre de navigation. [backdrop] floute le contenu dessous sous Android 12 et plus.
 */
@Composable
fun CadenceSnackbarHost(
    hostState: SnackbarHostState,
    modifier: Modifier = Modifier,
    backdrop: Backdrop? = null,
) {
    SnackbarHost(hostState, modifier.padding(horizontal = Space.gutter)) { data ->
        CadenceSnackbar(data, backdrop)
    }
}

/**
 * Bannière de confirmation : message qui nomme l'élément (« « Acheter du pain » terminée »)
 * et, si elle existe, l'action `Annuler` alignée à droite.
 */
@Composable
fun CadenceSnackbar(data: SnackbarData, backdrop: Backdrop? = null) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val tint = palette.containerHighest.copy(alpha = Glass.SnackbarAlpha)
    val surface = if (backdrop != null) {
        Modifier.hazeEffect(
            state = backdrop.haze,
            style = HazeStyle(
                backgroundColor = palette.background,
                tint = HazeTint(tint),
                blurRadius = Glass.blur,
                fallbackTint = HazeTint(palette.containerHighest.copy(alpha = Glass.FallbackAlpha)),
            ),
        )
    } else {
        Modifier.background(palette.containerHighest.copy(alpha = Glass.FallbackAlpha))
    }
    Row(
        Modifier
            .fillMaxWidth()
            .shadow(Elevation.floating, Radius.Control)
            .clip(Radius.Control)
            .then(surface)
            .border(Size.hairline, palette.glassBorder, Radius.Control)
            .heightIn(min = Size.touch)
            .padding(start = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            data.visuals.message,
            Modifier.weight(1f).padding(vertical = Space.md),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        data.visuals.actionLabel?.let { label ->
            Box(
                Modifier
                    .heightIn(min = Size.touch)
                    .clip(Radius.Control)
                    .clickable(role = Role.Button) {
                        haptic.tap()
                        data.performAction()
                    }
                    .padding(horizontal = Space.lg),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, style = MaterialTheme.typography.labelLarge, color = readableTintOf(palette.primary, palette.containerHighest))
            }
        } ?: Box(Modifier.padding(end = Space.lg))
    }
}
