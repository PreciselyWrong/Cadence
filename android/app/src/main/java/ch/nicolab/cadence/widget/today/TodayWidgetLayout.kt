package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.TaskItem
import kotlin.math.max

/** Lignes réellement dessinées et nombre de tâches que le widget ne peut pas montrer (« +N »). */
data class TodayRowFit(val overdue: List<TaskItem>, val tasks: List<TaskItem>, val overflow: Int)

/**
 * Place disponible dans le widget, en lignes de tâches. Un widget ne défile pas : ce qui ne tient
 * pas est annoncé par un pied « +N » plutôt que coupé au milieu d'une ligne.
 */
object TodayWidgetLayout {
    private const val CONTENT_PADDING_DP = 24f
    private const val HEADER_MIN_DP = 30f
    private const val HEADER_GAP_DP = 6f
    private const val ROW_PADDING_DP = 6f
    private const val CHECK_DP = 20f
    private const val FACET_DP = 32f
    private const val HABITS_GAP_DP = 6f
    private const val LINE_HEIGHT_RATIO = 1.3f
    private const val SECTION_LABEL_GAP_DP = 6f

    private fun rowHeight(sizes: TodayTextSizes): Float = max(CHECK_DP, sizes.body * LINE_HEIGHT_RATIO) + ROW_PADDING_DP

    /** Nombre de lignes (tâches puis événements) qui tiennent dans [heightDp] une fois l'en-tête et les habitudes posés. */
    fun rowCapacity(heightDp: Float, sizes: TodayTextSizes, habitsShown: Boolean, overdueLabelShown: Boolean): Int {
        var free = heightDp - CONTENT_PADDING_DP - max(HEADER_MIN_DP, sizes.title * LINE_HEIGHT_RATIO) - HEADER_GAP_DP
        if (habitsShown) free -= HABITS_GAP_DP + FACET_DP + 2 * sizes.small * LINE_HEIGHT_RATIO
        if (overdueLabelShown) free -= sizes.small * LINE_HEIGHT_RATIO + SECTION_LABEL_GAP_DP
        return (free / rowHeight(sizes)).toInt().coerceAtLeast(1)
    }

    /**
     * Garde au plus [capacity] lignes, retard d'abord. Quand des tâches restent cachées - par la
     * place ou par la limite de lignes du réglage - une ligne est réservée au pied « +N ».
     */
    fun fit(selection: TodaySelection, capacity: Int): TodayRowFit {
        val wanted = selection.overdue.size + selection.tasks.size
        val hidden = selection.total - wanted
        if (hidden <= 0 && wanted <= capacity) return TodayRowFit(selection.overdue, selection.tasks, 0)
        val room = (capacity - 1).coerceAtLeast(1)
        val overdue = selection.overdue.take(room)
        val tasks = selection.tasks.take(room - overdue.size)
        return TodayRowFit(overdue, tasks, selection.total - overdue.size - tasks.size)
    }
}
