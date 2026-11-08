package ch.nicolab.cadence.tasks.model

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

/**
 * Entonnoir de décision (docs/34-review.md) : En vue, Cette semaine, Plus tard. Aucun de ces états
 * n'est une échéance, une priorité ni un rappel ; ils ne changent que l'ordre des suggestions.
 */
enum class FunnelStage { IN_VIEW, THIS_WEEK, LATER }

object Funnel {
    /** Premier jour de la semaine qui contient [day], selon le premier jour du compte. */
    fun weekStart(day: LocalDate, firstDayOfWeek: DayOfWeek): LocalDate =
        day.with(TemporalAdjusters.previousOrSame(firstDayOfWeek))

    /** `first_day_of_week` du serveur : 0 = dimanche … 6 = samedi ; lundi par défaut, comme le serveur. */
    fun firstDayOf(server: Int?): DayOfWeek = when (server) {
        0 -> DayOfWeek.SUNDAY
        in 1..6 -> DayOfWeek.of(server!!)
        else -> DayOfWeek.MONDAY
    }

    /** Étape la plus avancée : Plus tard l'emporte, puis la semaine en cours, puis la vue. */
    fun stage(task: TaskItem, weekStart: LocalDate): FunnelStage? = when {
        task.someday -> FunnelStage.LATER
        task.weekOf == weekStart -> FunnelStage.THIS_WEEK
        task.inViewAt != null -> FunnelStage.IN_VIEW
        else -> null
    }

    fun has(task: TaskItem, stage: FunnelStage, weekStart: LocalDate): Boolean = when (stage) {
        FunnelStage.LATER -> task.someday
        FunnelStage.THIS_WEEK -> task.weekOf == weekStart
        FunnelStage.IN_VIEW -> task.inViewAt != null
    }
}

/** Jour, semaine et fuseau au moment de la décision. */
data class DecisionContext(val today: LocalDate, val weekStart: LocalDate, val zone: ZoneId)

/** Choix proposés par le bouton « Décider » de la revue, repris du web (`ReviewPage.tsx`). */
sealed interface Decision {
    data object Today : Decision
    data object ThisWeek : Decision
    data object NotThisWeek : Decision
    data object InView : Decision
    data object OutOfView : Decision
    data object Later : Decision
    data object KeepParked : Decision
    data object ReviewIn30Days : Decision
    data class ReviewOn(val day: LocalDate) : Decision
    data object Keep : Decision
    data object Drop : Decision
}

object ReviewDecisions {
    const val REVIEW_AFTER_DAYS = 30L

    /** Décision prise en revue : chacune horodate `reviewed_at`, ce qui la retire des listes et la compte dans la semaine. */
    fun change(decision: Decision, task: TaskItem, ctx: DecisionContext): TaskChange {
        val base = when (decision) {
            // Une tâche mise de côté ressort de « Plus tard » : sinon elle resterait hors des suggestions du jour.
            Decision.Today -> TaskViews.postponeChange(task, ctx.today, ctx.zone).let { if (task.someday) it.copy(later = false) else it }
            Decision.ThisWeek -> TaskChange(later = false, weekOf = ctx.weekStart, clearReviewOn = true, needsWhen = TaskViews.whenSettled(task))
            Decision.NotThisWeek -> TaskChange(clearWeek = true)
            Decision.InView -> TaskChange(later = false, inView = true, clearReviewOn = true, needsWhen = TaskViews.whenSettled(task))
            Decision.OutOfView -> TaskChange(inView = false)
            Decision.Later -> TaskChange(later = true, needsWhen = TaskViews.whenSettled(task))
            Decision.KeepParked -> TaskChange(clearReviewOn = true)
            Decision.ReviewIn30Days -> TaskChange(reviewOn = ctx.today.plusDays(REVIEW_AFTER_DAYS))
            is Decision.ReviewOn -> TaskChange(reviewOn = decision.day)
            Decision.Keep -> TaskChange()
            Decision.Drop -> TaskChange(status = TaskStatus.CANCELLED)
        }
        return base.copy(reviewed = true)
    }

    /** Puce de la fiche ou entrée du menu : allume ou éteint l'étape, sans horodater de revue. */
    fun toggle(stage: FunnelStage, task: TaskItem, ctx: DecisionContext): TaskChange {
        val on = !Funnel.has(task, stage, ctx.weekStart)
        return when (stage) {
            FunnelStage.IN_VIEW -> if (on) TaskChange(inView = true, later = false, needsWhen = TaskViews.whenSettled(task)) else TaskChange(inView = false)
            FunnelStage.THIS_WEEK -> if (on) TaskChange(weekOf = ctx.weekStart, later = false, needsWhen = TaskViews.whenSettled(task)) else TaskChange(clearWeek = true)
            FunnelStage.LATER -> if (on) TaskChange(later = true, needsWhen = TaskViews.whenSettled(task)) else TaskChange(later = false)
        }
    }
}
