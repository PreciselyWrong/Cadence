package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.tasks.model.DayHoursRange
import ch.nicolab.cadence.tasks.model.VisibleHours
import java.time.LocalTime
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Plage grisée (en minutes depuis minuit) hors de la journée de travail. */
internal data class OffWorkBand(val startMinute: Int, val endMinute: Int)

internal object AgendaHours {
    private const val MINUTES_PER_HOUR = 60
    private const val DEFAULT_START_HOUR = 8

    /**
     * Élargit [configured] pour englober tout bloc horaire des jours affichés qui déborderait
     * avant ou après la fenêtre configurée, afin qu'aucun événement ne soit coupé hors de la grille.
     */
    fun effectiveVisibleHours(configured: VisibleHours, layouts: Collection<DayLayout>): VisibleHours {
        var start = configured.startHour
        var end = configured.endHour
        for (layout in layouts) {
            for (block in layout.timed) {
                val blockStartHour = floor(block.startMinute / MINUTES_PER_HOUR.toDouble()).toInt().coerceIn(0, 23)
                val blockEndHour = ceil(block.endMinute / MINUTES_PER_HOUR.toDouble()).toInt().coerceIn(1, 24)
                if (blockStartHour < start) start = blockStartHour
                if (blockEndHour > end) end = blockEndHour
            }
        }
        return VisibleHours(start, end)
    }

    /** Heure de défilement initiale : 1 h avant maintenant si aujourd'hui est affiché, sinon début du travail. */
    fun initialScrollHour(
        visible: VisibleHours,
        workHours: DayHoursRange?,
        now: LocalTime,
        todayShown: Boolean,
    ): Int {
        val target = if (todayShown) {
            now.hour - 1
        } else {
            workHours?.let { it.startMinute / MINUTES_PER_HOUR } ?: DEFAULT_START_HOUR
        }
        return target.coerceIn(visible.startHour, (visible.endHour - 1).coerceAtLeast(visible.startHour))
    }

    /** Bandes hors journée de travail à griser dans la fenêtre [visible]. */
    fun offWorkBands(visible: VisibleHours, workHours: DayHoursRange?): List<OffWorkBand> {
        if (workHours == null) return emptyList()
        val gridStart = visible.startHour * MINUTES_PER_HOUR
        val gridEnd = visible.endHour * MINUTES_PER_HOUR
        val bands = mutableListOf<OffWorkBand>()
        val beforeEnd = min(workHours.startMinute, gridEnd)
        if (gridStart < beforeEnd) {
            bands += OffWorkBand(gridStart, beforeEnd)
        }
        val afterStart = max(workHours.endMinute, gridStart)
        if (afterStart < gridEnd) {
            bands += OffWorkBand(afterStart, gridEnd)
        }
        return bands
    }
}
