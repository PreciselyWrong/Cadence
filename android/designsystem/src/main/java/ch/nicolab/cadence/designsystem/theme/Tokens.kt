package ch.nicolab.cadence.designsystem.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.spring
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
    val gutter = 16.dp

    /** Écart entre deux lignes d'un même groupe connecté. */
    val groupGap = 2.dp
}

/** Rayons gradués selon la taille de l'objet, jamais un rayon unique partout. */
object Radius {
    val inner = 4.dp
    val checkbox = 8.dp
    val chip = 12.dp
    val control = 16.dp
    val fab = 18.dp
    val card = 20.dp
    val panel = 24.dp
    val sheet = 28.dp
    val pill = 999.dp

    val Inner = RoundedCornerShape(inner)
    val Chip = RoundedCornerShape(chip)
    val Control = RoundedCornerShape(control)
    val Fab = RoundedCornerShape(fab)
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
    val counterTrack = 4.dp
    val heatmapCell = 12.dp
    val iconSm = 16.dp
    val icon = 20.dp
    val iconLarge = 24.dp
    val actionSm = 36.dp
    val touch = 48.dp
    val headerButton = 48.dp
    val fab = 56.dp
    val checkbox = 24.dp
    val badgeHeight = 24.dp
    val rail = 3.dp
    val eventIcon = 14.dp
    val handleWidth = 32.dp
    val handleHeight = 4.dp
    val control = 52.dp
    val badge = 44.dp
    val calendarMark = 36.dp
    val statisticsPulse = 48.dp
    val navBar = 64.dp
    val sheetContent = 760.dp
}

/**
 * Mouvement fluide par ressort, sans rebond : amorti critique (1.0).
 * Les ressorts sont naturellement interruptibles et préservent la vitesse du geste.
 */
object Motion {
    const val QUICK = 140
    const val NORMAL = 240
    const val EXPRESSIVE = 380
    const val COLOR = 220

    /** Échelle appliquée à un élément pressé, sans rebond. */
    const val PRESS_SCALE = 0.97f

    fun <T> quick(): SpringSpec<T> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    fun <T> normal(): SpringSpec<T> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )

    fun <T> expressive(): SpringSpec<T> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessLow,
    )

    fun <T> interactive(): SpringSpec<T> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessHigh,
    )

    fun <T> color(): TweenSpec<T> = tween(COLOR)
}
