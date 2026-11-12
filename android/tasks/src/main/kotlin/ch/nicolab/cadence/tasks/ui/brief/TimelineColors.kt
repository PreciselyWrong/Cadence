package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.ui.graphics.Color
import ch.nicolab.cadence.designsystem.theme.CadencePalette

/** Couleurs de la frise : chaque bande se détache de la piste, y compris sur du noir pur (3:1, WCAG 1.4.11). */
internal data class TimelineColors(
    val track: Color,
    val grid: Color,
    val work: Color,
    val evening: Color,
    val event: Color,
    val onEvent: Color,
    val conflict: Color,
    val onConflict: Color,
    /** Créneau d'une tâche du plan d'aujourd'hui, déplaçable. */
    val task: Color,
    val onTask: Color,
) {
    companion object {
        private const val WORK_ALPHA = 0.65f
        private const val EVENING_ALPHA = 0.8f

        fun of(palette: CadencePalette) = TimelineColors(
            track = palette.containerLow,
            grid = palette.outlineVariant,
            work = palette.onSurfaceVariant.copy(alpha = WORK_ALPHA),
            evening = palette.primary.copy(alpha = EVENING_ALPHA),
            event = palette.primary,
            onEvent = palette.onPrimary,
            conflict = palette.error,
            onConflict = palette.onError,
            task = palette.primaryContainer,
            onTask = palette.onPrimaryContainer,
        )
    }
}
