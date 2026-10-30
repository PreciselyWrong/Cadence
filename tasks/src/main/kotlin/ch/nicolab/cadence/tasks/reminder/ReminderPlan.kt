package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Duration
import java.time.Instant

/**
 * Décisions de rappel sans Android : quelles alarmes poser, quelles notifications
 * retirer, et si « Terminer » vise encore la même occurrence.
 */
internal object ReminderPlan {
    /** Au-delà, les rappels ne sont posés qu'à l'approche (évite les alarmes lointaines). */
    val HORIZON: Duration = Duration.ofDays(14)

    /** Un rappel passé mais non remis reste posé pendant cette fenêtre (alarmes approchées tardives). */
    val LATE_WINDOW: Duration = Duration.ofHours(24)

    /** Valeur d'occurrence pour une tâche sans échéance. */
    const val NO_OCCURRENCE = Long.MIN_VALUE

    /** Clé d'un rappel remis, stockée par l'app : uid et instant du rappel. */
    fun deliveryKey(uid: String, reminderAt: Instant): String = "$uid|${reminderAt.toEpochMilli()}"

    /** Empreinte de l'état notifié : une modification d'échéance ou de rappel l'invalide. */
    fun signature(task: TaskItem): String =
        "${task.uid}|${occurrenceOf(task.dueDate)}|${task.reminderAt?.toEpochMilli() ?: NO_OCCURRENCE}"

    fun occurrenceOf(dueDate: Instant?): Long = dueDate?.toEpochMilli() ?: NO_OCCURRENCE

    /** Rappels à poser, par uid : à venir dans l'horizon, ou passés depuis moins de [LATE_WINDOW] et non remis. */
    fun wanted(tasks: List<TaskItem>, delivered: Set<String>, now: Instant): Map<String, Instant> {
        val horizon = now.plus(HORIZON)
        val earliest = now.minus(LATE_WINDOW)
        return buildMap {
            for (task in tasks) {
                if (task.isClosed) continue
                val at = task.reminderAt ?: continue
                val upcoming = at.isAfter(now) && !at.isAfter(horizon)
                val late = !at.isAfter(now) && !at.isBefore(earliest) &&
                    deliveryKey(task.uid, at) !in delivered
                if (upcoming || late) put(task.uid, at)
            }
        }
    }

    /** Retire les remises trop anciennes pour pouvoir encore être rattrapées. */
    fun pruneDelivered(delivered: Set<String>, now: Instant): Set<String> {
        val earliest = now.minus(LATE_WINDOW).toEpochMilli()
        return delivered.filterTo(HashSet()) { key ->
            (key.substringAfterLast('|').toLongOrNull() ?: Long.MIN_VALUE) >= earliest
        }
    }

    /** Notifications posées dont la tâche est fermée, supprimée ou déplacée : à retirer. */
    fun staleNotifications(posted: Set<String>, tasks: List<TaskItem>): Set<String> {
        val byUid = tasks.associateBy { it.uid }
        return posted.filterTo(HashSet()) { key ->
            val task = byUid[key.substringBefore('|')]
            task == null || task.isClosed || signature(task) != key
        }
    }

    /** Vrai si l'occurrence visée par la notification est encore l'échéance courante. */
    fun isSameOccurrence(task: TaskItem?, occurrence: Long): Boolean =
        task != null && !task.isClosed && occurrenceOf(task.dueDate) == occurrence
}
