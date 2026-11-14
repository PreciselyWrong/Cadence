package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material3.DropdownMenu
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionOnScreen
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.toSize
import kotlin.math.roundToInt
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.cadence
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

/** Contenu flouable de l'écran, fourni par l'écran principal ; null hors de lui (le fond devient alors presque opaque). */
val LocalBackdrop = staticCompositionLocalOf<Backdrop?> { null }

/**
 * Fond en verre d'une feuille modale ou d'un menu. Une feuille vit dans sa propre fenêtre, où le flou de l'écran ne
 * l'atteint pas : elle annonce sa place, et [GlassPanels] dessine dans la fenêtre principale, juste dessous, le voile
 * puis le verre flouté. Seul le fond du modal est flou, le reste de l'écran reste net sous le voile. Le conteneur doit
 * être transparent, voile compris ([glassScrim]). Sans [LocalBackdrop], fond presque opaque.
 */
@Composable
fun Modifier.glassWindow(
    shape: Shape,
    base: Color,
    blur: Dp = Glass.windowBlur,
    dims: Boolean = true,
    /** Décalage réel d'une feuille depuis le haut de sa fenêtre (`sheetState.requireOffset()`). */
    sheetOffset: (() -> Float)? = null,
    /** Faux pour une feuille : son conteneur peint le fond, car ce modificateur n'en suit pas le glissement. */
    paints: Boolean = true,
): Modifier {
    val fill = if (paints) background(base.copy(alpha = Glass.FallbackAlpha), shape) else this
    val backdrop = LocalBackdrop.current ?: return fill
    val panel = remember(backdrop) { GlassPanel(shape, base, blur, dims) }
    panel.shape = shape
    panel.base = base
    // Une feuille se mesure avant de glisser : sa place réelle est son décalage depuis le haut de la fenêtre.
    panel.shift = sheetOffset?.let { read -> { runCatching(read).getOrDefault(Float.NaN) } }
    DisposableEffect(backdrop, panel) {
        backdrop.panels += panel
        onDispose { backdrop.panels -= panel }
    }
    // Le fond reste peint dans la fenêtre du modal, opaque pour rester lisible : le verre de la fenêtre principale
    // peut ne pas se dessiner dessous, et ce qui est derrière ne doit pas transparaître.
    return fill.onGloballyPositioned { panel.bounds = Rect(it.positionOnScreen(), it.size.toSize()) }
}

/** Voile d'une feuille en verre : transparent quand [GlassPanels] le dessine, sinon le voile habituel. */
@Composable
fun glassScrim(): Color =
    if (LocalBackdrop.current != null) Color.Transparent else cadence.scrim.copy(alpha = Glass.ScrimAlpha)

/** Dessine, dans la fenêtre principale et hors de la source du flou, le voile et le verre des modals ouverts. */
@Composable
fun GlassPanels(backdrop: Backdrop, modifier: Modifier = Modifier) {
    if (backdrop.panels.isEmpty()) return
    val density = LocalDensity.current
    var origin by remember { mutableStateOf(Offset.Zero) }
    Box(modifier.fillMaxSize().onGloballyPositioned { origin = it.positionOnScreen() }) {
        if (backdrop.panels.any { it.dims }) {
            Box(Modifier.fillMaxSize().background(cadence.scrim.copy(alpha = Glass.ScrimAlpha)))
        }
        backdrop.panels.forEach { panel ->
            val rect = panel.bounds ?: return@forEach
            with(density) {
                Box(
                    Modifier
                        .offset {
                            val top = rect.top + (panel.shift?.invoke() ?: 0f)
                            if (top.isNaN()) IntOffset(0, Int.MAX_VALUE / 2)
                            else IntOffset((rect.left - origin.x).roundToInt(), (top - origin.y).roundToInt())
                        }
                        .size(rect.width.toDp(), rect.height.toDp())
                        .clip(panel.shape)
                        .hazeEffect(
                            state = backdrop.haze,
                            style = HazeStyle(
                                backgroundColor = panel.base,
                                tint = HazeTint(panel.base.glassy),
                                blurRadius = panel.blur,
                                fallbackTint = HazeTint(panel.base.copy(alpha = Glass.FallbackAlpha)),
                            ),
                        ),
                )
            }
        }
    }
}

/** Fond translucide des feuilles et menus : le flou de l'arrière-plan se devine au travers. */
val Color.glassy: Color get() = copy(alpha = Glass.WindowAlpha)

/** Menu déroulant en verre : fond translucide et flou derrière ; mêmes paramètres que [DropdownMenu]. */
@Composable
fun CadenceMenu(
    expanded: Boolean,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    offset: DpOffset = DpOffset(0.dp, 0.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismissRequest,
        modifier = modifier,
        offset = offset,
        shape = Radius.Control,
        containerColor = Color.Transparent,
        tonalElevation = 0.dp,
        shadowElevation = 6.dp,
    ) {
        Column(Modifier.glassWindow(Radius.Control, cadence.card, Glass.menuBlur, dims = false)) { content() }
    }
}

