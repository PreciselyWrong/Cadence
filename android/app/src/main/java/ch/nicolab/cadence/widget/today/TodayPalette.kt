package ch.nicolab.cadence.widget.today

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.toArgb
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.theme.CadencePalette
import ch.nicolab.cadence.designsystem.theme.DarkPalette
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.designsystem.theme.compositeOver
import ch.nicolab.cadence.designsystem.theme.contrastRatio
import ch.nicolab.cadence.designsystem.theme.glassBorder
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
        /** Opacité minimale du verre : en dessous, la surface ne se distingue plus du fond d'écran. */
        const val GLASS_MIN_ALPHA = 0.35f
        private const val GLASS_STEP = 0.01f
        private const val TEXT_CONTRAST = 4.5
        private const val ICON_CONTRAST = 3.0
        private const val OPAQUE = 0xFF000000.toInt()
        private const val MEDIUM_PRIORITY = 0xFFF57C00.toInt()
        private const val LOW_PRIORITY = 0xFF1976D2.toInt()
        private const val NO_SURFACE = 0x00000000
        private const val WHITE = 0xFFFFFFFF.toInt()
        private const val BARE_MUTED = 0xB3FFFFFF.toInt()

        /**
         * Les surfaces viennent des jetons du design system. Un widget ne peut pas flouter le fond
         * d'écran : le « Verre » est une surface translucide dont l'opacité ([Glass.WidgetAlphaLight],
         * [Glass.WidgetAlphaDark]) garde le texte lisible sur tout fond d'écran, bordée du liseré
         * `glassBorder` des éléments en verre de l'application. « Aucun » ne pose aucune surface
         * (texte blanc, pour un fond d'écran sombre).
         */
        fun of(config: TodayWidgetConfig, wallpaper: List<Int> = emptyList()): TodayPalettes {
            val light = fromTokens(LightPalette, config)
            val dark = fromTokens(DarkPalette, config)
            return when (config.background) {
                TodayBackground.VERRE -> TodayPalettes(
                    light.asGlass(LightPalette, Glass.WidgetAlphaLight, wallpaper),
                    dark.asGlass(DarkPalette, Glass.WidgetAlphaDark, wallpaper),
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
         * Verre posé dans son liseré. Sans couleurs connues du fond d'écran, l'opacité est [worstCase],
         * lisible sur tout fond. Avec les couleurs dominantes du fond d'écran, c'est la plus basse
         * (jusqu'à [GLASS_MIN_ALPHA]) qui garde encre, texte atténué et retard à 4,5:1 sur chacune.
         */
        private fun TodayPalette.asGlass(tokens: CadencePalette, worstCase: Float, wallpaper: List<Int>): TodayPalette {
            val surfaceArgb = tokens.surface.toArgb()
            val rim = tokens.glassBorder
            val rimArgb = rim.toArgb()
            fun readable(alpha: Float) = wallpaper.all { colour ->
                val seen = compositeOver(surfaceArgb, alpha, compositeOver(rimArgb or OPAQUE, rim.alpha, colour or OPAQUE))
                listOf(ink, muted, overdue).all { contrastRatio(it, seen) >= TEXT_CONTRAST }
            }
            val alpha = if (wallpaper.isEmpty()) {
                worstCase
            } else {
                generateSequence(GLASS_MIN_ALPHA) { it + GLASS_STEP }.takeWhile { it < worstCase }.firstOrNull(::readable) ?: worstCase
            }
            return copy(surface = tokens.surface.copy(alpha = alpha).toArgb(), rim = rimArgb)
        }
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
