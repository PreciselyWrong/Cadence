package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.ZoneId

/** Élément de la liste Aujourd'hui : une tâche de Cadence ou un événement de l'agenda de l'appareil. */
internal sealed interface TodayItem {
    val key: String

    data class Task(val task: TaskItem) : TodayItem {
        override val key: String get() = "task:${task.uid}"
    }

    data class Event(val event: EventWithDone) : TodayItem {
        override val key: String
            get() = "event:${event.event.calendarId}:${event.event.eventId}:${event.event.instanceBegin}"
    }
}

/**
 * Mêle les événements et les tâches du jour. Ordre : journées entières (ordre fourni), puis
 * éléments à heure par heure locale, puis tâches sans heure dans leur ordre d'origine.
 */
internal fun mergeTodayItems(
    tasks: List<TaskItem>,
    events: List<EventWithDone>,
    zone: ZoneId,
): List<TodayItem> {
    val allDay = events.filter { it.event.allDay }.map { TodayItem.Event(it) }
    val timed: List<Pair<TodayItem, Long>> =
        events.filterNot { it.event.allDay }.map { TodayItem.Event(it) to it.event.localStart(zone) } +
            tasks.mapNotNull { task -> task.dueTimeMillis()?.let { TodayItem.Task(task) to it } }
    val untimed = tasks.filter { it.dueTimeMillis() == null }.map { TodayItem.Task(it) }
    return allDay + timed.sortedBy { it.second }.map { it.first } + untimed
}

/** Instant de l'échéance seulement si elle porte une heure : sans heure, le serveur stocke la fin du jour. */
private fun TaskItem.dueTimeMillis(): Long? = dueDate?.takeIf { dueHasTime }?.toEpochMilli()
