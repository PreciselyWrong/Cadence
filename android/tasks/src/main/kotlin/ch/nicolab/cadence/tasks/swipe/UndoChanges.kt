package ch.nicolab.cadence.tasks.swipe

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.ZoneId

/** Modifications qui remettent une tâche dans l'état qu'elle avait avant un geste, pour « Annuler ». */
object UndoChanges {
    fun restoreDue(task: TaskItem, zone: ZoneId): TaskChange {
        val day = task.dueDay ?: return TaskChange(clearDue = true, needsWhen = restoreWhen(task))
        return TaskViews.postponeChange(task, day, zone).copy(needsWhen = restoreWhen(task))
    }

    /** « Quand ? » remis tel qu'avant le geste : seule une tâche qui l'attendait le redevient. */
    private fun restoreWhen(task: TaskItem): Boolean? = if (task.needsWhen) true else null

    fun restoreProject(task: TaskItem): TaskChange =
        task.projectUid?.let { TaskChange(projectUid = it) } ?: TaskChange(clearProject = true)

    fun restorePriority(task: TaskItem): TaskChange =
        task.priority?.let { TaskChange(priority = it) } ?: TaskChange(clearPriority = true)

    /** En vue, semaine, date de réexamen, « Plus tard » et « Quand ? » tels qu'avant le geste. */
    fun restoreFunnel(task: TaskItem): TaskChange = TaskChange(
        inView = task.inViewAt != null,
        weekOf = task.weekOf,
        clearWeek = task.weekOf == null,
        monthOf = task.monthOf,
        clearMonth = task.monthOf == null,
        reviewOn = task.reviewOn,
        clearReviewOn = task.reviewOn == null,
        later = task.someday,
        needsWhen = restoreWhen(task),
    )
}
