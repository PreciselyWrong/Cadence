package ch.nicolab.cadence.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import ch.nicolab.cadence.designsystem.components.NavigationSpacer
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.Space

/** Ossature commune des écrans principaux : même gouttière, même en-tête, même respiration. */
@Composable
internal fun ScreenList(
    context: String,
    title: String,
    action: (@Composable () -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) = ScreenList(
    header = { ScreenHeader(title, subtitle = context, actions = { action?.invoke() }) },
    content = content,
)

/** Variante à en-tête libre, pour les écrans qui partagent un en-tête avec un sélecteur. */
@Composable
internal fun ScreenList(
    header: @Composable () -> Unit,
    content: LazyListScope.() -> Unit,
) = LazyColumn(
    modifier = Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = Space.gutter),
    contentPadding = PaddingValues(top = Space.sm, bottom = Space.md),
    verticalArrangement = Arrangement.spacedBy(Space.md),
) {
    item { header() }
    content()
    item { NavigationSpacer() }
}
