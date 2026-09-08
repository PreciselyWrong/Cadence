package ch.nicolab.cadence.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * Jetons de design de Cadence.
 *
 * Toute valeur d'espacement, de rayon, d'élévation ou de durée utilisée par l'interface
 * provient d'ici. Aucun nombre magique ne doit apparaître dans un écran.
 */
object Space {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    val xxxl = 48.dp

    /** Marge latérale unique de tous les écrans. */
    val gutter = 20.dp
}

/** Rayons gradués selon la taille de l'objet, jamais un rayon unique partout. */
object Radius {
    val chip = 12.dp
    val control = 16.dp
    val card = 24.dp
    val panel = 28.dp
    val sheet = 32.dp
    val pill = 999.dp

    val Chip = RoundedCornerShape(chip)
    val Control = RoundedCornerShape(control)
    val Card = RoundedCornerShape(card)
    val Panel = RoundedCornerShape(panel)
    val Sheet = RoundedCornerShape(topStart = sheet, topEnd = sheet)
    val Pill = RoundedCornerShape(pill)
}

/** Profondeur réservée à ce qui flotte au-dessus du contenu. */
object Elevation {
    val flat = 0.dp
    val raised = 1.dp
    val floating = 10.dp
}

/** Tailles tactiles et iconographiques homogènes. */
object Size {
    val heatmapCell = 12.dp
    val icon = 20.dp
    val iconLarge = 24.dp
    val touch = 48.dp
    val control = 52.dp
    val badge = 52.dp
    val navBar = 64.dp
    val sheetContent = 480.dp
}

/** Mouvement court, sans rebond : il explique un changement, il ne décore pas. */
object Motion {
    private val standard = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    const val QUICK = 140
    const val NORMAL = 240
    const val EXPRESSIVE = 380

    fun <T> quick(): FiniteAnimationSpec<T> = tween(QUICK, easing = standard)
    fun <T> normal(): FiniteAnimationSpec<T> = tween(NORMAL, easing = standard)
    fun <T> expressive(): FiniteAnimationSpec<T> = tween(EXPRESSIVE, easing = standard)
}
