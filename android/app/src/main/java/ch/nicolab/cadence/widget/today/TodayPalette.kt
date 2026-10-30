package ch.nicolab.cadence.widget.today

import androidx.annotation.StringRes
import ch.nicolab.cadence.R

/**
 * Couleurs ARGB du widget « Aujourd'hui » dérivées de sa configuration. Un widget ne peut pas
 * flouter le fond d'écran : « Flou » et « Verre » sont des teintes translucides, « Clair » une
 * surface pleine, « Aucun » ne pose aucune surface.
 */
data class TodayPalette(
    val surface: Int,
    val veil: Int,
    val ink: Int,
    val muted: Int,
    val accent: Int,
    val overdue: Int,
) {
    companion object {
        private const val OVERDUE_ARGB = 0xFFE4574A.toInt()
        private const val LIGHT_INK = 0xFF1C1B1F.toInt()
        private const val DARK_INK = 0xFFFFFFFF.toInt()
        private const val LIGHT_SURFACE = 0xFFF7F7FA.toInt()
        private const val DARK_SURFACE = 0xFF000000.toInt()
        private const val MUTED_ALPHA = 0xB3

        fun of(config: TodayWidgetConfig): TodayPalette {
            val lightText = config.background == TodayBackground.FLOU || config.background == TodayBackground.CLAIR
            val ink = if (lightText) LIGHT_INK else DARK_INK
            return TodayPalette(
                surface = surfaceArgb(config),
                veil = withAlpha(0x000000, percentToAlpha(config.veil)),
                ink = ink,
                muted = (ink and 0x00FFFFFF) or (MUTED_ALPHA shl 24),
                accent = TodayControlPalette.argb(config.controlColour, config.freeControlArgb) ?: 0xFF7C8CFF.toInt(),
                overdue = OVERDUE_ARGB,
            )
        }

        private fun surfaceArgb(config: TodayWidgetConfig): Int = when (config.background) {
            TodayBackground.FLOU -> withAlpha(0xFFFFFF, percentToAlpha(config.intensity))
            TodayBackground.VERRE -> withAlpha(DARK_SURFACE, percentToAlpha(config.intensity))
            TodayBackground.CLAIR -> LIGHT_SURFACE
            TodayBackground.AUCUN -> 0x00000000
        }

        private fun withAlpha(rgb: Int, alpha: Int): Int = (alpha shl 24) or (rgb and 0x00FFFFFF)

        private fun percentToAlpha(percent: Int): Int = percent.coerceIn(0, 100) * 255 / 100
    }
}

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
