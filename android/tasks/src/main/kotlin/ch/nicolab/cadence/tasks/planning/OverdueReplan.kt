package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.swipe.UndoChanges
import java.time.LocalDate
import java.time.ZoneId

/** Choix d'une ligne de la feuille « Replanifier » des échues d'Aujourd'hui. */
internal sealed interface ReplanChoice {
    /** Un jour précis (Aujourd'hui, Demain, un jour de la rangée, une date du calendrier). */
    data class Day(val date: LocalDate) : ReplanChoice
    data object ThisWeek : ReplanChoice
    data object NextWeek : ReplanChoice
    data object ThisMonth : ReplanChoice
    data object Later : ReplanChoice
    data object Done : ReplanChoice
    data object Drop : ReplanChoice
    data object Skip : ReplanChoice
}

/** Familles de choix qu'une tâche accepte ([OverdueReplan.kinds]). */
internal enum class ReplanKind { DAY, HORIZON, DONE, DROP, SKIP }

/**
 * Écritures d'un choix : la tâche ([change]), les lignes du plan retirées ([plan]), le saut d'occurrence ([skip]) ou
 * la case cochée ([complete]).
 */
internal data class ReplanWrites(
    val change: TaskChange?,
    val plan: List<PlanEdit>,
    val skip: Boolean = false,
    val complete: Boolean = false,
)

/**
 * Feuille « Replanifier » des échues d'Aujourd'hui (`docs/02-today-page-sections.md`, Overdue) : un toucher par tâche.
 * Comme la semaine proposée (`docs/47-proposals.md`), une échue replacée n'est plus échue : un jour devient son
 * échéance, un horizon la vide. Ses lignes du plan d'aujourd'hui et après, sauf celle du jour choisi, sont retirées
 * pour qu'elle ne soit qu'à un endroit.
 */
internal object OverdueReplan {
    const val WEEK_DAYS = 7

    /** Une série se fait ou se saute ; une tâche de fichier TODO.md ne s'abandonne pas depuis Cadence. */
    fun kinds(task: TaskItem): Set<ReplanKind> = when {
        task.isRecurring -> setOf(ReplanKind.DONE, ReplanKind.SKIP)
        task.fileBacked -> setOf(ReplanKind.DAY, ReplanKind.HORIZON, ReplanKind.DONE)
        else -> setOf(ReplanKind.DAY, ReplanKind.HORIZON, ReplanKind.DONE, ReplanKind.DROP)
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
        fun toHorizon(horizon: Horizon): ReplanWrites {
            val writes = PlanBoard.horizonFromDate(task, horizon, plan, today, weekStart)
            return ReplanWrites(writes.change, writes.plan)
        }
        return when (choice) {
            is ReplanChoice.Day -> ReplanWrites(
                PlanBoard.withDatePicked(TaskViews.postponeChange(task, choice.date, zone), task),
                linesAhead(except = choice.date),
            )
            ReplanChoice.ThisWeek -> toHorizon(Horizon.WEEK)
            ReplanChoice.NextWeek -> toHorizon(Horizon.NEXT_WEEK)
            ReplanChoice.ThisMonth -> toHorizon(Horizon.THIS_MONTH)
            ReplanChoice.Later -> toHorizon(Horizon.SOMEDAY)
            ReplanChoice.Drop -> ReplanWrites(TaskChange(status = TaskStatus.CANCELLED), linesAhead())
            ReplanChoice.Done -> ReplanWrites(null, emptyList(), complete = true)
            ReplanChoice.Skip -> ReplanWrites(null, emptyList(), skip = true)
        }
    }

    /** Les échues qu'une action groupée déplace : ni série (elle se fait ou se saute), ni occurrence virtuelle. */
    private fun movable(tasks: List<TaskItem>): List<TaskItem> =
        tasks.filter { !it.isRecurring && !it.virtual }.distinctBy { it.uid }

    /** « Tout à demain ». */
    fun allTomorrow(tasks: List<TaskItem>, today: LocalDate): List<Pair<TaskItem, ReplanChoice>> =
        movable(tasks).map { it to ReplanChoice.Day(today.plusDays(1)) }

    /**
     * « Étaler sur 7 jours » : même répartition que celle de Planifier ([PlanBoard.spread], jour le moins chargé
     * d'aujourd'hui à J+6), mais chaque jour devient l'échéance, comme un choix d'une ligne.
     */
    fun spread(tasks: List<TaskItem>, plan: List<PlanEntry>, all: List<TaskItem>, today: LocalDate): List<Pair<TaskItem, ReplanChoice>> {
        val minutes = all.associate { it.uid to it.estimatedMinutes }
        val last = today.plusDays(PlanBoard.SPREAD_DAYS - 1L)
        val planned = plan.filter { !it.day.isBefore(today) && !it.day.isAfter(last) }
            .distinctBy { it.day to it.uid }
            .groupBy({ it.day }, { minutes[it.uid] })
        val late = movable(tasks)
        val byUid = late.associateBy { it.uid }
        return PlanBoard.spread(late, planned, today).map { (uid, day) -> byUid.getValue(uid) to ReplanChoice.Day(day) }
    }

    /** Les sept jours de la rangée, chacun avec son nombre de tâches ([counts], 0 sinon). */
    fun weekDays(today: LocalDate, counts: Map<LocalDate, Int>): List<Pair<LocalDate, Int>> =
        (0 until WEEK_DAYS).map { today.plusDays(it.toLong()) }.map { it to (counts[it] ?: 0) }

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
