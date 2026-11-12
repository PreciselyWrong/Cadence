package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TodayOrder
import java.time.Instant
import java.time.ZoneId

/** Élément de la liste Aujourd'hui (partagé par l'app et le widget, pour qu'ils ne divergent pas) : une tâche de Cadence ou un événement de l'agenda de l'appareil. */
sealed interface TodayItem {
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
 * éléments à heure par heure locale, puis tâches sans heure : celles du plan du jour dans son ordre ([planOrder], le
 * même ordre que le web), puis celles rangées par `today_order`, puis les autres dans leur ordre d'origine.
 * [planStarts] : l'heure où le plan du jour du serveur place une tâche, qui prime sur son échéance.
 */
fun mergeTodayItems(
    tasks: List<TaskItem>,
    events: List<EventWithDone>,
    zone: ZoneId,
    planStarts: Map<String, Instant> = emptyMap(),
    planOrder: List<String> = emptyList(),
): List<TodayItem> {
    fun TaskItem.startMillis(): Long? = planStarts[uid]?.toEpochMilli() ?: dueTimeMillis()
    val allDay = events.filter { it.event.allDay }.map { TodayItem.Event(it) }
    val rank = planOrder.withIndex().associate { (index, uid) -> uid to index }
    // Une tâche du plan sans heure (ni créneau ni échéance horaire) suit l'ordre du plan.
    val (inPlan, notInPlan) = tasks.partition { it.uid in rank && it.startMillis() == null }
    // Une tâche rangée à la main quitte l'horloge : l'ordre choisi prime sur l'heure.
    val (placed, free) = notInPlan.partition { TodayOrder.of(it) != null }
    val timed: List<Pair<TodayItem, Long>> =
        events.filterNot { it.event.allDay }.map { TodayItem.Event(it) to it.event.localStart(zone) } +
            free.mapNotNull { task -> task.startMillis()?.let { TodayItem.Task(task) to it } }
    val untimed = free.filter { it.startMillis() == null }.map { TodayItem.Task(it) }
    return allDay + timed.sortedBy { it.second }.map { it.first } +
        inPlan.sortedBy { rank.getValue(it.uid) }.map { TodayItem.Task(it) } +
        TodayOrder.apply(placed).map { TodayItem.Task(it) } + untimed
}

/** Instant de l'échéance seulement si elle porte une heure : sans heure, le serveur stocke la fin du jour. */
private fun TaskItem.dueTimeMillis(): Long? = dueDate?.takeIf { dueHasTime }?.toEpochMilli()
