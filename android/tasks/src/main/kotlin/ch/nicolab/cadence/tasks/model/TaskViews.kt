package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Règles d'affichage partagées par les écrans et le widget, reprises de
 * Tududi : une tâche reportée (defer_until futur) n'apparaît nulle part, une
 * sous-tâche reste sous sa tâche parente.
 */
object TaskViews {
    private fun visibleNow(task: TaskItem, now: Instant) =
        task.parentTaskUid == null && !task.isClosed &&
            (task.deferUntil == null || !task.deferUntil.isAfter(now))

    /**
     * En retard, prévues aujourd'hui, ou en cours / planifiées / en attente. Une tâche mise de côté
     * (« Plus tard », `someday`) n'est jamais en retard : son échéance passée ne la ramène pas.
     */
    fun today(tasks: List<TaskItem>, today: LocalDate, now: Instant): List<TaskItem> =
        tasks.filter { task ->
            if (!visibleNow(task, now)) return@filter false
            val due = task.dueDay
            if (task.someday && due != null && due.isBefore(today)) return@filter false
            (due != null && !due.isAfter(today)) ||
                task.status == TaskStatus.IN_PROGRESS ||
                task.status == TaskStatus.PLANNED ||
                task.status == TaskStatus.WAITING
        }.sortedWith(todayOrder)

    /**
     * Suggestions du jour : la prochaine action choisie de chaque projet, puis les tâches décidées pour la
     * semaine [weekStart], puis celles en vue (la plus récemment mise en vue d'abord), hors « Plus tard » et
     * hors ce qu'Aujourd'hui montre déjà. Un projet qui a choisi sa prochaine action ([nextByProject],
     * projet vers tâche) ne propose que celle-là.
     */
    fun suggestions(
        tasks: List<TaskItem>,
        today: LocalDate,
        now: Instant,
        weekStart: LocalDate,
        nextByProject: Map<String, String> = emptyMap(),
    ): List<TaskItem> {
        val shown = today(tasks, today, now).mapTo(hashSetOf()) { it.uid }
        val picks = nextByProject.filter { (project, uid) ->
            tasks.any { it.uid == uid && it.projectUid == project && !it.isClosed }
        }
        val open = tasks.filter { task ->
            visibleNow(task, now) && !task.someday && task.uid !in shown &&
                (task.projectUid == null || task.projectUid !in picks || picks[task.projectUid] == task.uid)
        }
        val designated = open.filter { it.projectUid != null && picks[it.projectUid] == it.uid }.sortedBy { it.name.lowercase() }
        val rest = open.filterNot { it in designated }
        val week = rest.filter { it.weekOf == weekStart }.sortedBy { it.name.lowercase() }
        val inView = rest.filter { it.weekOf != weekStart && it.inViewAt != null }.sortedByDescending { it.inViewAt }
        return designated + week + inView
    }

    fun overdue(tasks: List<TaskItem>, today: LocalDate, now: Instant): List<TaskItem> =
        today(tasks, today, now).filter { it.dueDay?.isBefore(today) == true }

    /** Tâches à échéance dans les [days] prochains jours, après aujourd'hui, groupées par jour. */
    fun upcoming(
        tasks: List<TaskItem>,
        today: LocalDate,
        now: Instant,
        days: Long = 7,
    ): Map<LocalDate, List<TaskItem>> {
        val last = today.plusDays(days)
        return tasks
            .filter { visibleNow(it, now) }
            .mapNotNull { task -> task.dueDay?.let { it to task } }
            .filter { (due, _) -> due.isAfter(today) && !due.isAfter(last) }
            .sortedWith(compareBy({ it.first }, { it.second.dueDate }))
            .groupBy({ it.first }, { it.second })
    }

    /** Tâches ouvertes sans échéance ni projet : à trier. */
    fun unsorted(tasks: List<TaskItem>, now: Instant): List<TaskItem> =
        tasks.filter { visibleNow(it, now) && it.dueDate == null && it.dueDay == null && it.projectUid == null }

    fun ofProject(tasks: List<TaskItem>, projectUid: String, now: Instant): List<TaskItem> =
        tasks.filter { it.projectUid == projectUid && visibleNow(it, now) }
            .sortedWith(compareBy<TaskItem> { it.dueDate == null }.thenBy { it.dueDate }.thenBy { it.name.lowercase() })

    /**
     * Report d'une tâche au [day] : une échéance à heure fixe garde son heure locale,
     * sinon la tâche redevient une échéance de journée.
     */
    fun postponeChange(task: TaskItem, day: LocalDate, zone: ZoneId): TaskChange {
        val time = task.dueDate?.takeIf { task.dueHasTime }?.atZone(zone)?.toLocalTime()
        return TaskChange(dueDate = day, dueTime = time?.format(hourMinute))
    }

    fun completedToday(tasks: List<TaskItem>, today: LocalDate, zone: ZoneId): List<TaskItem> =
        tasks.filter { it.status == TaskStatus.DONE && it.completedAt?.atZone(zone)?.toLocalDate() == today }

    private val hourMinute: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    private val todayOrder =
        compareBy<TaskItem> { it.pinnedAt == null }
            .thenByDescending { it.priority ?: -1 }
            .thenBy { it.dueDay }
            .thenBy { if (it.dueHasTime) it.dueDate else null }
            .thenBy { it.name.lowercase() }
}
