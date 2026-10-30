package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Règles d'affichage partagées par les écrans et le widget, reprises de
 * Tududi : une tâche reportée (defer_until futur) n'apparaît nulle part, une
 * sous-tâche reste sous sa tâche parente.
 */
object TaskViews {
    fun localDueDate(task: TaskItem, zone: ZoneId): LocalDate? =
        task.dueDate?.atZone(zone)?.toLocalDate()

    private fun visibleNow(task: TaskItem, now: Instant) =
        task.parentTaskUid == null && !task.isClosed &&
            (task.deferUntil == null || !task.deferUntil.isAfter(now))

    /** En retard, prévues aujourd'hui, ou en cours / planifiées / en attente. */
    fun today(tasks: List<TaskItem>, today: LocalDate, zone: ZoneId, now: Instant): List<TaskItem> =
        tasks.filter { task ->
            if (!visibleNow(task, now)) return@filter false
            val due = localDueDate(task, zone)
            (due != null && !due.isAfter(today)) ||
                task.status == TaskStatus.IN_PROGRESS ||
                task.status == TaskStatus.PLANNED ||
                task.status == TaskStatus.WAITING
        }.sortedWith(todayOrder(zone))

    fun overdue(tasks: List<TaskItem>, today: LocalDate, zone: ZoneId, now: Instant): List<TaskItem> =
        today(tasks, today, zone, now).filter { localDueDate(it, zone)?.isBefore(today) == true }

    /** Tâches à échéance dans les [days] prochains jours, après aujourd'hui, groupées par jour. */
    fun upcoming(
        tasks: List<TaskItem>,
        today: LocalDate,
        zone: ZoneId,
        now: Instant,
        days: Long = 7,
    ): Map<LocalDate, List<TaskItem>> {
        val last = today.plusDays(days)
        return tasks
            .filter { visibleNow(it, now) }
            .mapNotNull { task -> localDueDate(task, zone)?.let { it to task } }
            .filter { (due, _) -> due.isAfter(today) && !due.isAfter(last) }
            .sortedWith(compareBy({ it.first }, { it.second.dueDate }))
            .groupBy({ it.first }, { it.second })
    }

    /** Tâches ouvertes sans échéance ni projet : à trier. */
    fun unsorted(tasks: List<TaskItem>, now: Instant): List<TaskItem> =
        tasks.filter { visibleNow(it, now) && it.dueDate == null && it.projectUid == null }

    fun ofProject(tasks: List<TaskItem>, projectUid: String, now: Instant): List<TaskItem> =
        tasks.filter { it.projectUid == projectUid && visibleNow(it, now) }
            .sortedWith(compareBy<TaskItem> { it.dueDate == null }.thenBy { it.dueDate }.thenBy { it.name.lowercase() })

    fun completedToday(tasks: List<TaskItem>, today: LocalDate, zone: ZoneId): List<TaskItem> =
        tasks.filter { it.status == TaskStatus.DONE && it.completedAt?.atZone(zone)?.toLocalDate() == today }

    private fun todayOrder(zone: ZoneId) =
        compareBy<TaskItem> { it.pinnedAt == null }
            .thenByDescending { it.priority ?: -1 }
            .thenBy { it.dueDate?.atZone(zone)?.toLocalDate() }
            .thenBy { if (it.dueHasTime) it.dueDate else null }
            .thenBy { it.name.lowercase() }
}
