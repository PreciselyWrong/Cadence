package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.util.lerp
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/** Échelle du titre une fois l'en-tête réduit : 30 sp devient environ 22 sp. */
private const val COLLAPSED_TITLE_SCALE = 0.74f

/**
 * Progression de la réduction d'un en-tête. Le défilement du contenu consomme d'abord la
 * distance de réduction, puis rend la main à la liste ; remonter en haut de liste le redéplie.
 * `fraction` vaut 0 déplié, 1 réduit.
 */
@Stable
class HeaderCollapse internal constructor(private val rangePx: Float) {
    private var offsetPx by mutableFloatStateOf(0f)

    val fraction: Float get() = if (rangePx <= 0f) 0f else (-offsetPx / rangePx).coerceIn(0f, 1f)

    internal val connection = object : NestedScrollConnection {
        override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
            if (available.y >= 0f || offsetPx <= -rangePx) return Offset.Zero
            val next = (offsetPx + available.y).coerceIn(-rangePx, 0f)
            val used = next - offsetPx
            offsetPx = next
            return Offset(0f, used)
        }

        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            if (available.y <= 0f || offsetPx >= 0f) return Offset.Zero
            val next = (offsetPx + available.y).coerceIn(-rangePx, 0f)
            val used = next - offsetPx
            offsetPx = next
            return Offset(0f, used)
        }
    }
}

/** Réduction fournie par [CollapsingHeaderHost] ; `null` hors d'un hôte : l'en-tête reste déplié. */
val LocalHeaderCollapse = compositionLocalOf<HeaderCollapse?> { null }

/**
 * Enveloppe d'un écran dont l'en-tête [ScreenHeader] se réduit quand le contenu défile.
 * Entourer l'en-tête et la liste qui défile ; aucun autre câblage.
 */
@Composable
fun CollapsingHeaderHost(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val range = with(LocalDensity.current) { Size.headerCollapse.toPx() }
    val collapse = remember(range) { HeaderCollapse(range) }
    CompositionLocalProvider(LocalHeaderCollapse provides collapse) {
        Box(modifier.nestedScroll(collapse.connection)) { content() }
    }
}

/**
 * En-tête d'écran : retour facultatif, titre fort, sous-titre de contexte et actions à droite.
 * La ligne de titre a la même hauteur sur tous les onglets, donc la même ligne de base ; le
 * sous-titre vit dessous et disparaît à la réduction.
 */
@Composable
fun ScreenHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    backDescription: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val palette = cadence
    val collapse = LocalHeaderCollapse.current
    val expandedRow = with(LocalDensity.current) { Size.headerRow.roundToPx() }
    val compactRow = with(LocalDensity.current) { Size.headerRowCompact.roundToPx() }
    val subtitleHeight = with(LocalDensity.current) { Size.headerSubtitle.roundToPx() }
    Column(modifier.fillMaxWidth().padding(top = Space.sm, bottom = Space.sm)) {
        Row(
            Modifier.fillMaxWidth().layout { measurable, constraints ->
                val height = lerp(expandedRow, compactRow, collapse?.fraction ?: 0f)
                val placeable = measurable.measure(Constraints.fixed(constraints.maxWidth, height))
                layout(placeable.width, height) { placeable.place(0, 0) }
            },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                RoundHeaderButton(
                    icon = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = backDescription.orEmpty(),
                    style = HeaderButtonStyle.Plain,
                    onClick = onBack,
                )
                Spacer(Modifier.width(Space.sm))
            }
            Text(
                title,
                Modifier.weight(1f).graphicsLayer {
                    val scale = lerp(1f, COLLAPSED_TITLE_SCALE, collapse?.fraction ?: 0f)
                    scaleX = scale
                    scaleY = scale
                    transformOrigin = TransformOrigin(0f, 0.5f)
                },
                style = MaterialTheme.typography.displaySmall,
                color = palette.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
                verticalAlignment = Alignment.CenterVertically,
                content = actions,
            )
        }
        subtitle?.let {
            Text(
                it,
                Modifier
                    .layout { measurable, constraints ->
                        val height = lerp(subtitleHeight, 0, collapse?.fraction ?: 0f)
                        val placeable = measurable.measure(constraints.copy(minHeight = 0, maxHeight = subtitleHeight))
                        layout(placeable.width, height) { placeable.place(0, 0) }
                    }
                    .graphicsLayer { alpha = 1f - (collapse?.fraction ?: 0f) },
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
