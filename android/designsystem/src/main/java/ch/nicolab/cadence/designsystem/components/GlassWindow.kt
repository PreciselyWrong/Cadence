package ch.nicolab.cadence.designsystem.components

import android.content.Context
import android.os.Build
import android.view.View
import android.view.WindowManager
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material3.DropdownMenu
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogWindowProvider
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Floute ce qui est derrière la fenêtre qui porte ce contenu (une feuille modale ou un menu), Android 12 et plus, quand
 * l'appareil le permet (`isCrossWindowBlurEnabled`). Ailleurs, rien : le fond translucide et le voile suffisent.
 */
@Composable
fun GlassWindowBlur(radius: Dp = Glass.windowBlur) {
    val view = LocalView.current
    val px = with(LocalDensity.current) { radius.roundToPx() }
    DisposableEffect(view, px) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) blurBehind(view, px)
        onDispose {}
    }
}

private fun blurBehind(view: View, px: Int) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val manager = view.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    if (!manager.isCrossWindowBlurEnabled) return
    // Une feuille modale vit dans une fenêtre de dialogue : on règle la fenêtre elle-même.
    var parent: Any? = view.parent
    while (parent != null) {
        if (parent is DialogWindowProvider) {
            val window = parent.window
            window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
            window.attributes = window.attributes.apply { blurBehindRadius = px }
            return
        }
        parent = (parent as? View)?.parent
    }
    // Un menu vit dans une fenêtre de popup ajoutée au gestionnaire de fenêtres : on met à jour ses paramètres.
    val root = view.rootView
    val params = root.layoutParams as? WindowManager.LayoutParams ?: return
    params.flags = params.flags or WindowManager.LayoutParams.FLAG_BLUR_BEHIND
    params.blurBehindRadius = px
    runCatching { manager.updateViewLayout(root, params) }
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
        containerColor = cadence.card.glassy,
        tonalElevation = 0.dp,
        shadowElevation = 6.dp,
    ) {
        GlassWindowBlur(Glass.menuBlur)
        content()
    }
}

