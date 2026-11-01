package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.ui.TodayItem
import ch.nicolab.cadence.tasks.ui.mergeTodayItems
import java.time.ZoneId

/** Mise en page du widget : [FULL] liste les tâches, [COMPACT] montre seulement le prochain élément. */
enum class TodaySizeClass { FULL, COMPACT }

object TodaySize {
    /** Taille minimale par axe du plein format (en-tête, habitudes et une ligne de liste). */
    const val FULL_MIN_DP = 180f

    /** Plein format seulement quand les deux axes le permettent ; un 2x2 ou un 2x1 reste compact. */
    fun classOf(widthDp: Float, heightDp: Float): TodaySizeClass =
        if (widthDp >= FULL_MIN_DP && heightDp >= FULL_MIN_DP) TodaySizeClass.FULL else TodaySizeClass.COMPACT
}

/**
 * Élément le plus proche du format compact : un retard d'abord, puis le premier élément de la
 * liste du jour (tâches mêlées aux événements). Null quand il n'y a rien à montrer.
 */
object TodayCompactNext {
    fun of(selection: TodaySelection, zone: ZoneId): TodayItem? {
        val overdue = selection.overdue.map { TodayItem.Task(it) }
        return (overdue + mergeTodayItems(selection.tasks, selection.events, zone)).firstOrNull()
    }
}
