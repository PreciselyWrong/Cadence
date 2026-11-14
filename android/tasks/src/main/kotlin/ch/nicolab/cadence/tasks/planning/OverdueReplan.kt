package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.swipe.UndoChanges
import java.time.LocalDate
import java.time.ZoneId

/** Choix d'une ligne de la feuille « Replanifier » des échues d'Aujourd'hui. */
internal enum class ReplanChoice { TODAY, TOMORROW, NEXT_WEEK, LATER, DROP, SKIP }

/** Écritures d'un choix : la tâche ([change]), les lignes du plan retirées ([plan]) et le saut d'occurrence ([skip]). */
internal data class ReplanWrites(val change: TaskChange?, val plan: List<PlanEdit>, val skip: Boolean = false)

/**
 * Feuille « Replanifier » des échues d'Aujourd'hui (`docs/02-today-page-sections.md`, Android) : un toucher par tâche.
 * Comme la semaine proposée (`docs/47-proposals.md`), une échue replacée n'est plus échue : un jour devient son
 * échéance, un horizon la vide. Ses lignes du plan d'aujourd'hui et après, sauf celle du jour choisi, sont retirées
 * pour qu'elle ne soit qu'à un endroit.
 */
internal object OverdueReplan {
    /** Une série se fait (sa case) ou se saute ; une tâche de fichier TODO.md ne s'abandonne pas depuis Cadence. */
    fun choices(task: TaskItem): List<ReplanChoice> = when {
        task.isRecurring -> listOf(ReplanChoice.SKIP)
        task.fileBacked -> listOf(ReplanChoice.TODAY, ReplanChoice.TOMORROW, ReplanChoice.NEXT_WEEK, ReplanChoice.LATER)
        else -> listOf(ReplanChoice.TODAY, ReplanChoice.TOMORROW, ReplanChoice.NEXT_WEEK, ReplanChoice.LATER, ReplanChoice.DROP)
    }

    fun writes(
        task: TaskItem,
        choice: ReplanChoice,
        plan: List<PlanEntry>,
        today: LocalDate,
        weekStart: LocalDate,
        zone: ZoneId,
    ): ReplanWrites {
        fun linesAhead(except: LocalDate? = null): List<PlanEdit> = plan
            .filter { it.uid == task.uid && !it.day.isBefore(today) && it.day != except }
            .map { it.day }.distinct().sorted()
            .map { RemoveTask(it, task.uid) }
        fun onDay(day: LocalDate) = ReplanWrites(
            PlanBoard.withDatePicked(TaskViews.postponeChange(task, day, zone), task),
            linesAhead(except = day),
        )
        fun toHorizon(horizon: Horizon): ReplanWrites {
            val writes = PlanBoard.horizonFromDate(task, horizon, plan, today, weekStart)
            return ReplanWrites(writes.change, writes.plan)
        }
        return when (choice) {
            ReplanChoice.TODAY -> onDay(today)
            ReplanChoice.TOMORROW -> onDay(today.plusDays(1))
            ReplanChoice.NEXT_WEEK -> toHorizon(Horizon.NEXT_WEEK)
            ReplanChoice.LATER -> toHorizon(Horizon.SOMEDAY)
            ReplanChoice.DROP -> ReplanWrites(TaskChange(status = TaskStatus.CANCELLED), linesAhead())
            ReplanChoice.SKIP -> ReplanWrites(null, emptyList(), skip = true)
        }
    }

    /** « Annuler » : échéance, engagement, « Plus tard » et statut d'avant (les lignes du plan, par leur propre annulation). */
    fun restore(task: TaskItem, zone: ZoneId): TaskChange {
        val due = UndoChanges.restoreDue(task, zone)
        return UndoChanges.restoreFunnel(task).copy(
            dueDate = due.dueDate,
            dueTime = due.dueTime,
            clearDue = due.clearDue,
            status = task.status,
        )
    }
}
