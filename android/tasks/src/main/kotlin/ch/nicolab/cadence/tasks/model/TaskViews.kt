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

    /** En retard, prévues aujourd'hui, ou en cours / planifiées / en attente. */
    fun today(tasks: List<TaskItem>, today: LocalDate, now: Instant): List<TaskItem> =
        tasks.filter { task ->
            if (!visibleNow(task, now)) return@filter false
            val due = task.dueDay
            (due != null && !due.isAfter(today)) ||
                task.status == TaskStatus.IN_PROGRESS ||
                task.status == TaskStatus.PLANNED ||
                task.status == TaskStatus.WAITING
        }.sortedWith(todayOrder)

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
