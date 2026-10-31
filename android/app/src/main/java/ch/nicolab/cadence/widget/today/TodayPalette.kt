package ch.nicolab.cadence.widget.today

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.toArgb
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.theme.CadencePalette
import ch.nicolab.cadence.designsystem.theme.DarkPalette
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.designsystem.theme.glassBorder

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
    companion object {
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
        fun of(config: TodayWidgetConfig): TodayPalettes {
            val light = fromTokens(LightPalette, config)
            val dark = fromTokens(DarkPalette, config)
            return when (config.background) {
                TodayBackground.VERRE -> TodayPalettes(
                    light.asGlass(LightPalette, Glass.WidgetAlphaLight),
                    dark.asGlass(DarkPalette, Glass.WidgetAlphaDark),
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

        private fun TodayPalette.asGlass(tokens: CadencePalette, alpha: Float): TodayPalette =
            copy(surface = tokens.surface.copy(alpha = alpha).toArgb(), rim = tokens.glassBorder.toArgb())
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
