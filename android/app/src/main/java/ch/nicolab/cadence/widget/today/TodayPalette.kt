package ch.nicolab.cadence.widget.today

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.theme.CadencePalette
import ch.nicolab.cadence.designsystem.theme.DarkPalette
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.designsystem.theme.readableTint
import ch.nicolab.cadence.tasks.model.TaskPriority

/**
 * Couleurs ARGB du widget « Aujourd'hui » pour un thème donné. [rim] est le liseré du verre,
 * transparent pour les autres fonds.
 */
data class TodayPalette(
    val surface: Int,
    val ink: Int,
    val muted: Int,
    val accent: Int,
    val overdue: Int,
    val rim: Int = NO_SURFACE,
) {
    /**
     * Teinte de la case d'une tâche. En mode [ControlColour.PRIORITE], la priorité colore la case
     * comme dans l'application (haute = rouge du retard, moyenne orange, basse bleue) et une tâche
     * sans priorité garde une case discrète ; chaque teinte reste à 3:1 sur la surface.
     */
    /**
     * Teinte de la case d'une tâche : en mode [ControlColour.PROJET], la couleur du projet ; un projet
     * sans couleur prend celle de la priorité, pour que les cases ne soient pas toutes pareilles.
     */
    fun taskTint(priority: Int?, control: ControlColour, projectArgb: Int?): Int =
        if (control == ControlColour.PROJET) projectArgb ?: checkTint(priority, ControlColour.PRIORITE) else checkTint(priority, control)

    fun checkTint(priority: Int?, control: ControlColour): Int {
        if (control != ControlColour.PRIORITE) return accent
        val behind = surface or OPAQUE
        return when (priority) {
            TaskPriority.HIGH -> overdue
            TaskPriority.MEDIUM -> readableTint(MEDIUM_PRIORITY, behind, ICON_CONTRAST)
            TaskPriority.LOW -> readableTint(LOW_PRIORITY, behind, ICON_CONTRAST)
            else -> muted
        }
    }

    companion object {
        private const val ICON_CONTRAST = 3.0
        private const val OPAQUE = 0xFF000000.toInt()
        private const val MEDIUM_PRIORITY = 0xFFF57C00.toInt()
        private const val LOW_PRIORITY = 0xFF1976D2.toInt()
        private const val NO_SURFACE = 0x00000000
        private const val WHITE = 0xFFFFFFFF.toInt()
        private const val BARE_MUTED = 0xB3FFFFFF.toInt()

        /**
         * Les surfaces viennent des jetons du design system. Un widget ne peut pas flouter le fond
         * d'écran : le « Verre » est une surface translucide réglable (opacité, reflet, liseré).
         * « Aucun » ne pose aucune surface (texte blanc, pour un fond d'écran sombre).
         */
        private const val RIM_MAX_ALPHA = 0.6f
        private const val SHEEN_MAX_ALPHA = 0.45f

        /** Opacité du reflet blanc en haut à gauche du verre ; nulle hors du verre. */
        fun sheenAlpha(config: TodayWidgetConfig): Float =
            if (config.background == TodayBackground.VERRE) config.glassSheen / 100f * SHEEN_MAX_ALPHA else 0f

        fun of(config: TodayWidgetConfig): TodayPalettes {
            val light = fromTokens(LightPalette, config)
            val dark = fromTokens(DarkPalette, config)
            return when (config.background) {
                TodayBackground.VERRE -> TodayPalettes(
                    light.asGlass(LightPalette, config),
                    dark.asGlass(DarkPalette, config),
                )
                TodayBackground.AUTO -> TodayPalettes(light, dark)
                TodayBackground.CLAIR -> TodayPalettes(light, light)
                TodayBackground.SOMBRE -> TodayPalettes(dark, dark)
                TodayBackground.AUCUN -> {
                    val bare = dark.copy(surface = NO_SURFACE, ink = WHITE, muted = BARE_MUTED)
                    TodayPalettes(bare, bare)
                }
            }
        }

        private fun fromTokens(tokens: CadencePalette, config: TodayWidgetConfig): TodayPalette {
            val ink = tokens.onSurface.toArgb()
            val chosen = TodayControlPalette.argb(config.controlColour, config.freeControlArgb)
            return TodayPalette(
                surface = tokens.surface.toArgb(),
                ink = ink,
                muted = tokens.onSurfaceVariant.toArgb(),
                // Le contrôle « Blanc » est invisible sur une surface claire : il prend l'encre du thème.
                accent = if (config.controlColour == ControlColour.BLANC) ink else chosen ?: tokens.primary.toArgb(),
                overdue = tokens.error.toArgb(),
            )
        }

        /**
         * Verre posé dans son liseré : surface du thème à l'opacité choisie, liseré blanc. La
         * lisibilité dépend alors du fond d'écran : c'est le prix d'une transparence réglable.
         */
        private fun TodayPalette.asGlass(tokens: CadencePalette, config: TodayWidgetConfig): TodayPalette = copy(
            surface = tokens.surface.copy(alpha = config.glassOpacity / 100f).toArgb(),
            rim = Color.White.copy(alpha = config.glassRim / 100f * RIM_MAX_ALPHA).toArgb(),
        )
    }
}

/**
 * Palettes de jour et de nuit du widget. Le widget fournit les deux au lanceur, qui choisit selon
 * le thème du téléphone sans attendre une mise à jour : un changement de thème ne le laisse donc
 * jamais illisible.
 */
data class TodayPalettes(val day: TodayPalette, val night: TodayPalette)

/** Tailles de texte du widget, en sp, selon [TodayTextSize]. */
data class TodayTextSizes(val title: Int, val body: Int, val small: Int) {
    companion object {
        fun of(size: TodayTextSize): TodayTextSizes = when (size) {
            TodayTextSize.S -> TodayTextSizes(title = 14, body = 12, small = 10)
            TodayTextSize.M -> TodayTextSizes(title = 16, body = 14, small = 12)
            TodayTextSize.L -> TodayTextSizes(title = 18, body = 16, small = 14)
        }
    }
}

/** Titre d'en-tête pour un périmètre de tâches. */
@StringRes
fun scopeTitle(scope: TaskScope): Int = when (scope) {
    TaskScope.OVERDUE_AND_TODAY, TaskScope.TODAY -> R.string.today_scope_today
    TaskScope.TOMORROW -> R.string.today_scope_tomorrow
    TaskScope.NEXT_3 -> R.string.today_scope_next_3
    TaskScope.NEXT_7 -> R.string.today_scope_next_7
    TaskScope.NO_DATE -> R.string.today_scope_no_date
    TaskScope.INBOX -> R.string.today_scope_inbox
}
