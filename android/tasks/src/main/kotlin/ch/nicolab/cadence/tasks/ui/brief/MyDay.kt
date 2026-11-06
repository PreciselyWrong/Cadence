package ch.nicolab.cadence.tasks.ui.brief

import ch.nicolab.cadence.tasks.brief.MoveDto
import ch.nicolab.cadence.tasks.brief.TonightDto
import ch.nicolab.cadence.tasks.model.TaskItem

/** Listes de « Ma journée », où chaque tâche n'apparaît qu'une fois. */
internal data class MyDayLists(
    val priorities: List<TonightDto>,
    val moves: List<MoveDto>,
    val overdue: List<TaskItem>,
)

internal object MyDay {
    /** Une priorité reste une priorité ; une tâche à déplacer n'a pas besoin d'être triée en plus parmi les échues. */
    fun lists(priorities: List<TonightDto>, moves: List<MoveDto>, overdue: List<TaskItem>): MyDayLists {
        val priorityUids = priorities.mapTo(HashSet()) { it.taskUid }
        val shownMoves = moves.filterNot { it.taskUid in priorityUids }
        val handled = priorityUids + shownMoves.map { it.taskUid }
        return MyDayLists(priorities, shownMoves, overdue.filterNot { it.uid in handled })
    }
}
