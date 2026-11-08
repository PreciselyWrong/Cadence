package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TagPaths
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.ui.TodayItem
import ch.nicolab.cadence.tasks.ui.mergeTodayItems
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
    tags: List<TagItem> = emptyList(),
    weekStart: LocalDate,
): TodaySelection {
    // Filtrer par une étiquette parente inclut ses sous-étiquettes, comme sur le web.
    val tagScope = TagPaths.withDescendants(tags, config.tagUids)
    val candidates = scopeTasks(tasks, config.taskScope, today, now, zone, weekStart)
        .filter { !config.highPriorityOnly || it.priority == TaskPriority.HIGH }
        .filter { config.projectUids.isEmpty() || it.projectUid in config.projectUids }
        .filter { tagScope.isEmpty() || it.tagUids.any(tagScope::contains) }
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

/**
 * Section de la liste du widget. [day] est le jour d'échéance quand les tâches sont regroupées par
 * jour, null pour la section « En retard » unique, le reste non regroupé ou les tâches sans date.
 * [labelled] dit si la section porte un intitulé : une section seule et à jour n'en a pas, le
 * titre du widget le dit déjà. [items] mêle les événements du jour aux tâches de la section
 * d'aujourd'hui, avec la fonction de la liste Aujourd'hui de l'application ([mergeTodayItems]).
 */
data class TodaySection(
    val day: LocalDate?,
    val overdue: Boolean,
    val labelled: Boolean,
    val tasks: List<TaskItem>,
    val items: List<TodayItem> = tasks.map { TodayItem.Task(it) },
)

/**
 * Découpe les tâches de [selection] en sections, par jour d'échéance ou en « retards puis le reste ».
 * Les événements du jour rejoignent la section d'aujourd'hui (la section sans retard quand rien n'est regroupé).
 */
fun taskSections(selection: TodaySelection, config: TodayWidgetConfig, today: LocalDate, zone: ZoneId): List<TodaySection> {
    val events = selection.events
    fun merged(tasks: List<TaskItem>, withEvents: Boolean): List<TodayItem> = mergeTodayItems(tasks, if (withEvents) events else emptyList(), zone)
    if (!config.groupByDay) {
        return listOfNotNull(
            selection.overdue.takeIf { it.isNotEmpty() }?.let { TodaySection(null, overdue = true, labelled = true, tasks = it) },
            (selection.tasks.takeIf { it.isNotEmpty() || events.isNotEmpty() })
                ?.let { TodaySection(null, overdue = false, labelled = false, tasks = it, items = merged(it, withEvents = true)) },
        )
    }
    val byDay = (selection.overdue + selection.tasks).groupBy { it.dueDay }.toMutableMap()
    if (events.isNotEmpty() && today !in byDay) byDay[today] = emptyList()
    val days = byDay.keys.sortedWith(nullsLast())
    val single = days.size == 1 && days.single()?.isBefore(today) != true
    return days.map { day ->
        val tasks = byDay.getValue(day)
        TodaySection(day, overdue = day?.isBefore(today) == true, labelled = !single, tasks = tasks, items = merged(tasks, withEvents = day == today))
    }
}

/**
 * Identifiants des intitulés de la liste du widget. Les tâches prennent le `hashCode` de leur uid
 * (plage d'un Int) ; Glance refuse tout identifiant inférieur à -2^62. Les intitulés vivent entre
 * les deux, autour de -2^40.
 */
object TodayListIds {
    private const val BASE = -(1L shl 40)
    const val OVERDUE = BASE - 1
    const val EVENTS = BASE - 2
    const val UNDATED = BASE - 3
    private const val DAYS = BASE - (1L shl 32)

    fun day(day: LocalDate): Long = DAYS + day.toEpochDay()
}

private fun scopeTasks(
    tasks: List<TaskItem>,
    scope: TaskScope,
    today: LocalDate,
    now: Instant,
    zone: ZoneId,
    weekStart: LocalDate,
): List<TaskItem> =
    when (scope) {
        TaskScope.OVERDUE_AND_TODAY -> TaskViews.today(tasks, today, now)
        // Une série en retard est exclue d'« aujourd'hui seulement » par son occurrence enregistrée ; son occurrence du jour y reste.
        TaskScope.TODAY -> TaskViews.today(tasks, today, now).filterNot { it.isOverdue(today) } +
            TaskViews.todayOccurrences(tasks, today, now, zone)
        TaskScope.TOMORROW -> TaskViews.upcoming(tasks, today, now, zone, days = 1).values.flatten()
        TaskScope.NEXT_3 -> TaskViews.upcoming(tasks, today, now, zone, days = 3).values.flatten()
        TaskScope.NEXT_7 -> TaskViews.upcoming(tasks, today, now, zone, days = 7).values.flatten()
        TaskScope.NO_DATE -> tasks.filter { task ->
            val deferredUntil = task.deferUntil
            task.parentTaskUid == null && !task.isClosed && task.dueDate == null && task.dueDay == null &&
                (deferredUntil == null || !deferredUntil.isAfter(now))
        }
        TaskScope.INBOX -> TaskViews.unsorted(tasks, now, weekStart)
    }

private fun TaskItem.isOverdue(today: LocalDate): Boolean = dueDay?.isBefore(today) == true

private val dueOrder: Comparator<TaskItem> =
    compareBy<TaskItem>({ it.dueDay == null }, { it.dueDay }, { if (it.dueHasTime) it.dueDate else null }, { it.name.lowercase() })

private fun comparatorOf(sort: TaskSort): Comparator<TaskItem> = when (sort) {
    TaskSort.DUE -> dueOrder
    TaskSort.PRIORITY -> compareByDescending<TaskItem> { it.priority ?: -1 }.then(dueOrder)
    TaskSort.PROJECT -> compareBy<TaskItem>({ it.projectUid == null }, { it.projectUid }).then(dueOrder)
}
