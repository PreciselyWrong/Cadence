package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.LocalDate
import java.time.ZoneId

/**
 * Écritures de la planification. Jour prévu, report et créneau sont des [PlanEdit] (plan du jour, jamais l'échéance) ;
 * « Plus tard » et l'échéance elle-même sont des [TaskChange], par `TaskRepository.updateTask`.
 */
object PlanningChanges {
    /**
     * Change l'échéance pour [day] en gardant l'heure fixe. Seulement là où l'échéance est l'objet du geste : proposition
     * « À déplacer » du Résumé et « Choisir une date » du bilan du soir (comme le web).
     */
    fun moveToDay(task: TaskItem, day: LocalDate, zone: ZoneId): TaskChange =
        TaskViews.postponeChange(task, day, zone)

    /** « Plus tard » : la tâche sort de la vue, son échéance reste. */
    fun later(): TaskChange = TaskChange(later = true)

    /**
     * « Reporter » : le plan change, l'échéance non. Une tâche déjà au plan d'[today] y est déplacée vers [day] ; une autre
     * est ajoutée au plan de [day].
     */
    internal fun reportPlan(task: TaskItem, today: LocalDate, day: LocalDate, plannedToday: Boolean): PlanEdit =
        if (plannedToday) MoveTask(today, task.uid, day) else AddTask(day, task.uid)

    /** « Aujourd'hui » (ou un autre jour) : la tâche s'ajoute au plan de [day] ; l'échéance ne bouge pas. */
    internal fun planOn(task: TaskItem, day: LocalDate): PlanEdit = AddTask(day, task.uid)

    /** Proposition acceptée : un créneau sur le plan de [day], sa durée d'après le bloc ; l'échéance ne bouge pas. */
    internal fun place(day: LocalDate, block: ProposedBlock): PlanEdit =
        SlotTask(day, block.uid, block.start, block.end - block.start)

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
