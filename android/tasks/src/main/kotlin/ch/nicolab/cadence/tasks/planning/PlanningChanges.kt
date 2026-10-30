package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.LocalDate
import java.time.ZoneId

/**
 * Écritures de la planification, toutes exprimées en [TaskChange] : elles passent par
 * `TaskRepository.updateTask`, donc par la file d'envoi et la synchronisation.
 */
object PlanningChanges {
    /** Reporte au [day] en gardant l'heure d'une échéance à heure fixe. */
    fun moveToDay(task: TaskItem, day: LocalDate, zone: ZoneId): TaskChange =
        TaskViews.postponeChange(task, day, zone)

    /** « Plus tard » : la tâche quitte la journée sans date inventée. */
    fun later(): TaskChange = TaskChange(clearDue = true)

    /** Proposition acceptée : la tâche reçoit l'heure de son créneau. */
    fun place(day: LocalDate, block: ProposedBlock): TaskChange =
        TaskChange(dueDate = day, dueTime = "%02d:%02d".format(block.start / 60, block.start % 60))

    /** Remet l'échéance telle qu'elle était avant une opération groupée. */
    fun restore(original: TaskItem, zone: ZoneId): TaskChange {
        val day = original.dueDay ?: return TaskChange(clearDue = true)
        return TaskViews.postponeChange(original, day, zone)
    }

    /**
     * Tâches que les opérations groupées déplacent. Une tâche récurrente demande le choix d'une
     * portée (cette occurrence, les suivantes…) : elle se reporte à la main, pas en lot.
     */
    fun movable(tasks: List<TaskItem>): List<TaskItem> = tasks.filter { !it.isClosed && !it.isRecurring }
}
