package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.tasks.model.RecurrenceExpansion
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * Décisions de rappel sans Android : quelles alarmes poser, quelles notifications
 * retirer, et si « Terminer » vise encore la même occurrence.
 *
 * Deux sortes de rappel, chacune repérée par un instant « repère » ([Wanted.marker]) : le `reminder_at` explicite
 * d'une tâche, ou l'échéance horaire d'une occurrence quand [TimedReminders] est actif et qu'aucun rappel
 * explicite n'existe. Une alarme est identifiée par `uid|repère` ([alarmKey]) : une série à heure fixe en a une
 * par occurrence dans l'horizon.
 */
internal object ReminderPlan {
    /** Au-delà, les rappels ne sont posés qu'à l'approche (évite les alarmes lointaines). */
    val HORIZON: Duration = Duration.ofDays(14)

    /** Un rappel passé mais non remis reste posé pendant cette fenêtre (alarmes approchées tardives). */
    val LATE_WINDOW: Duration = Duration.ofHours(24)

    /** Un rappel à heure fixe non remis (téléphone éteint) ne sonne plus que dans la quinzaine de minutes qui suit. */
    val TIMED_LATE_WINDOW: Duration = Duration.ofMinutes(15)

    /** Valeur d'occurrence pour une tâche sans échéance. */
    const val NO_OCCURRENCE = Long.MIN_VALUE

    /** Clé d'un rappel remis, stockée par l'app : uid et instant du rappel. */
    fun deliveryKey(uid: String, reminderAt: Instant): String = "$uid|${reminderAt.toEpochMilli()}"

    /** Empreinte de l'état notifié : une modification d'échéance ou de rappel l'invalide. */
    fun signature(task: TaskItem): String =
        "${task.uid}|${occurrenceOf(task.dueDate)}|${task.reminderAt?.toEpochMilli() ?: NO_OCCURRENCE}"

    fun occurrenceOf(dueDate: Instant?): Long = dueDate?.toEpochMilli() ?: NO_OCCURRENCE

    /** Clé d'une alarme : tâche et repère du rappel. */
    fun alarmKey(uid: String, marker: Instant): String = deliveryKey(uid, marker)

    /** Rappel voulu : sonne à [notifyAt] pour le repère [marker] (échéance de l'occurrence ou `reminder_at`). */
    data class Wanted(val uid: String, val marker: Instant, val notifyAt: Instant) {
        val key: String get() = alarmKey(uid, marker)
    }

    /**
     * Échéances horaires d'une tâche, repères de ses rappels à heure fixe : l'occurrence enregistrée et, pour une
     * série, ses occurrences entre [from] et [to]. Vide sans réglage actif, pour une tâche fermée, « Plus tard »,
     * sans heure ou avec un rappel explicite (qui l'emporte), et pour une occurrence avant la date de report.
     */
    fun timedMarkers(task: TaskItem, timed: TimedReminders, from: Instant, to: Instant, zone: ZoneId): List<Instant> {
        val due = task.dueDate
        if (!timed.enabled || task.isClosed || task.someday || task.reminderAt != null || !task.dueHasTime || due == null) {
            return emptyList()
        }
        val later = RecurrenceExpansion.expand(
            task,
            from.atZone(zone).toLocalDate(),
            to.plus(timed.lead.duration).atZone(zone).toLocalDate(),
            zone,
        ).mapNotNull { it.dueDate }
        return (listOf(due) + later).filter { marker -> task.deferUntil?.let { !marker.isBefore(it) } ?: true }
    }

    /** Vrai si [marker] est encore un repère de rappel de [task] : son `reminder_at`, ou une échéance horaire. */
    fun isCurrentMarker(task: TaskItem?, marker: Long, timed: TimedReminders, now: Instant, zone: ZoneId): Boolean {
        if (task == null || task.isClosed) return false
        if (task.reminderAt?.toEpochMilli() == marker) return true
        return timedMarkers(task, timed, now.minus(LOOKBACK), now.plus(HORIZON), zone).any { it.toEpochMilli() == marker }
    }

    private val LOOKBACK: Duration = Duration.ofDays(2)

    /**
     * Rappels à poser, par clé d'alarme : à venir dans l'horizon, ou passés depuis moins de [LATE_WINDOW] (explicite)
     * ou [TIMED_LATE_WINDOW] (heure fixe) et non remis. L'heure de sonnerie compte la plage silencieuse : une alarme
     * repoussée au matin reste voulue toute la nuit. Le téléphone est la seule voix des rappels de tâches : seule
     * sa propre remise ([delivered], par appareil) l'empêche de sonner ; `reminder_sent_at` est la comptabilité du
     * serveur et n'est pas lu ici.
     */
    fun wanted(
        tasks: List<TaskItem>,
        delivered: Set<String>,
        now: Instant,
        timed: TimedReminders = TimedReminders.OFF,
        quiet: QuietPolicy = QuietPolicy.NONE,
        zone: ZoneId = ZoneId.systemDefault(),
    ): Map<String, Wanted> {
        val horizon = now.plus(HORIZON)
        val earliest = now.minus(LATE_WINDOW)
        val timedEarliest = now.minus(TIMED_LATE_WINDOW)
        return buildMap {
            for (task in tasks) {
                if (task.isClosed) continue
                val explicit = task.reminderAt
                if (explicit != null) {
                    val upcoming = explicit.isAfter(now) && !explicit.isAfter(horizon)
                    val late = !explicit.isAfter(now) && !explicit.isBefore(earliest) &&
                        deliveryKey(task.uid, explicit) !in delivered
                    if (upcoming || late) Wanted(task.uid, explicit, explicit).let { put(it.key, it) }
                    continue
                }
                for (marker in timedMarkers(task, timed, earliest, horizon, zone)) {
                    val notifyAt = timed.lead.notifyAt(marker)
                    val ring = quiet.shift(notifyAt)
                    val upcoming = ring.isAfter(now) && !notifyAt.isAfter(horizon)
                    val late = !ring.isAfter(now) && !ring.isBefore(timedEarliest) && deliveryKey(task.uid, marker) !in delivered
                    if (upcoming || late) Wanted(task.uid, marker, notifyAt).let { put(it.key, it) }
                }
            }
        }
    }

    /** Alarme d'un rappel : [reminderAt] est le repère (clé de remise), [triggerAt] l'heure repoussée par la plage silencieuse. */
    data class PlannedAlarm(val uid: String, val reminderAt: Instant, val triggerAt: Instant)

    /**
     * Ce qu'il faut poser et retirer. [scheduledKeys] : clés des alarmes de rappel déjà posées ; [storedSnoozes] : reports
     * enregistrés. Un report encore valable (tâche ouverte, même repère de rappel, pas plus vieux que [LATE_WINDOW])
     * est reposé, les autres sont à oublier.
     */
    data class AlarmPlan(
        val reminders: Map<String, PlannedAlarm>,
        val staleReminders: Set<String>,
        val snoozes: Map<String, TaskSnooze>,
        val staleSnoozes: Set<String>,
    )

    fun alarms(
        tasks: List<TaskItem>,
        delivered: Set<String>,
        scheduledKeys: Set<String>,
        storedSnoozes: Set<String>,
        now: Instant,
        quiet: QuietPolicy,
        timed: TimedReminders = TimedReminders.OFF,
        zone: ZoneId = ZoneId.systemDefault(),
    ): AlarmPlan {
        val wanted = wanted(tasks, delivered, now, timed, quiet, zone)
        val byUid = tasks.associateBy { it.uid }
        val earliest = now.minus(LATE_WINDOW)
        val valid = mutableMapOf<String, TaskSnooze>()
        val stale = mutableSetOf<String>()
        for (raw in storedSnoozes) {
            val snooze = TaskSnooze.decode(raw)
            val task = snooze?.let { byUid[it.uid] }
            val alive = snooze != null && task != null && !snooze.triggerAt.isBefore(earliest) &&
                isCurrentMarker(task, snooze.reminderAt, timed, now, zone)
            if (alive) valid[snooze.uid] = snooze else stale += raw
        }
        return AlarmPlan(
            reminders = wanted.mapValues { (_, w) -> PlannedAlarm(w.uid, w.marker, quiet.shift(w.notifyAt)) },
            staleReminders = scheduledKeys.filterNotTo(HashSet()) { it in wanted },
            snoozes = valid,
            staleSnoozes = stale,
        )
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
