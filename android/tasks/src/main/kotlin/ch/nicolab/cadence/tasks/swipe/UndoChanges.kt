package ch.nicolab.cadence.tasks.swipe

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.ZoneId

/** Modifications qui remettent une tâche dans l'état qu'elle avait avant un geste, pour « Annuler ». */
object UndoChanges {
    fun restoreDue(task: TaskItem, zone: ZoneId): TaskChange {
        val day = task.dueDay ?: return TaskChange(clearDue = true)
        return TaskViews.postponeChange(task, day, zone)
    }

    fun restoreProject(task: TaskItem): TaskChange =
        task.projectUid?.let { TaskChange(projectUid = it) } ?: TaskChange(clearProject = true)

    fun restorePriority(task: TaskItem): TaskChange =
        task.priority?.let { TaskChange(priority = it) } ?: TaskChange(clearPriority = true)

    /** En vue, semaine, date de réexamen et « Plus tard » tels qu'avant le geste. */
    fun restoreFunnel(task: TaskItem): TaskChange = TaskChange(
        inView = task.inViewAt != null,
        weekOf = task.weekOf,
        clearWeek = task.weekOf == null,
        reviewOn = task.reviewOn,
        clearReviewOn = task.reviewOn == null,
        later = task.someday,
    )
}
