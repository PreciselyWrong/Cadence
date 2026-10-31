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
    val Checkbox = RoundedCornerShape(checkbox)
}

/** Profondeur réservée à ce qui flotte au-dessus du contenu. */
object Elevation {
    val flat = 0.dp
    val raised = 1.dp
    val floating = 10.dp
}

/** Verre translucide : flou de la barre de navigation et voiles associés. */
object Glass {
    val blur = 24.dp

    /** Opacité du fond de la barre de navigation, claire puis sombre. */
    const val BarAlphaLight = 0.60f
    const val BarAlphaDark = 0.72f

    /** Opacité de repli quand le flou n'est pas disponible (API < 31). */
    const val FallbackAlpha = 0.92f

    /** Voile de fond d'un modal. */
    const val ScrimAlpha = 0.50f

    /** Poignée de feuille modale. */
    const val HandleAlpha = 0.40f

    /** Teinte d'un badge coloré par un projet ou un calendrier. */
    const val BadgeAlpha = 0.16f

    /** Compteur d'un onglet sélectionné, posé sur le fond primaire. */
    const val CountAlpha = 0.75f

    /** Fond de la bannière de message (snackbar), au-dessus du contenu. */
    const val SnackbarAlpha = 0.86f

    /** Dégradé sous les barres système : opacité du fond au bord de l'écran. */
    const val SystemScrimAlpha = 0.94f
}

/** Tailles tactiles et iconographiques homogènes. */
object Size {
    val tab = 40.dp
    val navItem = 44.dp
    val settingRow = 64.dp
    val badgeIcon = 14.dp
    val hairline = 1.dp
    val stroke = 2.dp
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
    val agendaHour = 56.dp
    val agendaGutter = 44.dp
    val agendaDot = 5.dp

    /** En-tête d'écran : même hauteur de ligne de titre partout, réduite au défilement. */
    val headerRow = 56.dp
    val headerRowCompact = 48.dp
    val headerSubtitle = 20.dp
    val headerCollapse = 32.dp

    /** Carte d'habitude (e07). */
    val habitCard = 80.dp

    /** Largeur maximale d'une facette de la routine : les facettes se groupent au centre au lieu de s'étirer. */
    val routineFacet = 72.dp
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
