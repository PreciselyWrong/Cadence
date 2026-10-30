package ch.nicolab.cadence.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import ch.nicolab.cadence.ui.components.NavigationSpacer
import ch.nicolab.cadence.ui.components.PageHeader
import ch.nicolab.cadence.ui.theme.Space

/** Ossature commune des écrans principaux : même gouttière, même en-tête, même respiration. */
@Composable
internal fun ScreenList(
    context: String,
    title: String,
    action: (@Composable () -> Unit)? = null,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) = LazyColumn(
    modifier = Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = Space.gutter),
    contentPadding = PaddingValues(top = Space.sm, bottom = Space.md),
    verticalArrangement = Arrangement.spacedBy(Space.md),
) {
    item { PageHeader(context, title, action) }
    content()
    item { NavigationSpacer() }
}
