package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Ce que le widget affiche pour une configuration : toutes les tâches retenues, sans limite de
 * lignes (la liste défile). [overdue] reste vide quand la section « En retard » est désactivée.
 */
data class TodaySelection(
    val total: Int,
    val overdueTotal: Int,
    val overdue: List<TaskItem>,
    val tasks: List<TaskItem>,
    val events: List<EventWithDone>,
)

/** Filtre et trie les tâches et événements du jour selon [config]. Fonction pure. */
fun selectWidgetTasks(
    tasks: List<TaskItem>,
    events: List<EventWithDone>,
    config: TodayWidgetConfig,
    today: LocalDate,
    zone: ZoneId,
    now: Instant = Instant.now(),
): TodaySelection {
    val candidates = scopeTasks(tasks, config.taskScope, today, now)
        .filter { !config.highPriorityOnly || it.priority == TaskPriority.HIGH }
        .filter { config.projectUids.isEmpty() || it.projectUid in config.projectUids }
        .filter { config.tagUids.isEmpty() || it.tagUids.any(config.tagUids::contains) }
        .filter { !config.hideRecurring || !it.isRecurring }
        .sortedWith(comparatorOf(config.sort))
    val overdueFirst = config.showOverdueSection
    val overdue = if (overdueFirst) candidates.filter { it.isOverdue(today) }.sortedWith(dueOrder) else emptyList()
    val others = candidates.filterNot { overdueFirst && it.isOverdue(today) }
    val shownEvents = if (config.showEvents) {
        events.sortedWith(compareBy<EventWithDone>({ !it.event.allDay }, { it.event.localStart(zone) }, { it.event.title }))
    } else {
        emptyList()
    }
    return TodaySelection(
        total = candidates.size,
        overdueTotal = overdue.size,
        overdue = overdue,
        tasks = others,
        events = shownEvents,
    )
}

private fun scopeTasks(tasks: List<TaskItem>, scope: TaskScope, today: LocalDate, now: Instant): List<TaskItem> =
    when (scope) {
        TaskScope.OVERDUE_AND_TODAY -> TaskViews.today(tasks, today, now)
        TaskScope.TODAY -> TaskViews.today(tasks, today, now).filterNot { it.isOverdue(today) }
        TaskScope.TOMORROW -> TaskViews.upcoming(tasks, today, now, days = 1).values.flatten()
        TaskScope.NEXT_3 -> TaskViews.upcoming(tasks, today, now, days = 3).values.flatten()
        TaskScope.NEXT_7 -> TaskViews.upcoming(tasks, today, now, days = 7).values.flatten()
        TaskScope.NO_DATE -> tasks.filter { task ->
            val deferredUntil = task.deferUntil
            task.parentTaskUid == null && !task.isClosed && task.dueDate == null && task.dueDay == null &&
                (deferredUntil == null || !deferredUntil.isAfter(now))
        }
        TaskScope.INBOX -> TaskViews.unsorted(tasks, now)
    }

private fun TaskItem.isOverdue(today: LocalDate): Boolean = dueDay?.isBefore(today) == true

private val dueOrder: Comparator<TaskItem> =
    compareBy<TaskItem>({ it.dueDay == null }, { it.dueDay }, { if (it.dueHasTime) it.dueDate else null }, { it.name.lowercase() })

private fun comparatorOf(sort: TaskSort): Comparator<TaskItem> = when (sort) {
    TaskSort.DUE -> dueOrder
    TaskSort.PRIORITY -> compareByDescending<TaskItem> { it.priority ?: -1 }.then(dueOrder)
    TaskSort.PROJECT -> compareBy<TaskItem>({ it.projectUid == null }, { it.projectUid }).then(dueOrder)
}
