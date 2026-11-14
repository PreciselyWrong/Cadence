package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.calendar.ofDays
import ch.nicolab.cadence.calendar.overlaps
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Planifier v2 (`docs/fork/ANDROID-UX-NOTES.md`, « Planifier v2 ») : la bande de la semaine, le jour choisi, le tiroir
 * « À placer » et les choix d'une tâche. Règles pures : l'écran (`ui/PlanTab.kt`) ne fait qu'afficher et appeler les
 * écritures existantes du `TasksViewModel`.
 */

/**
 * Un jour de la bande : [taskCount] tâches ouvertes, [minutes] prévues sur [capacityMinutes], [eventColors] les
 * couleurs (ARGB) de ses événements d'agenda, trois au plus, et [eventCount] leur nombre total.
 */
internal data class WeekDay(
    val date: LocalDate,
    val taskCount: Int,
    val minutes: Int,
    val capacityMinutes: Int,
    val eventCount: Int,
    val eventColors: List<Int>,
) {
    /** Plein : la charge atteint la capacité (capacité nulle : jamais plein). */
    val full: Boolean get() = capacityMinutes > 0 && minutes >= capacityMinutes

    /** Libre : ni tâche ni événement. */
    val free: Boolean get() = taskCount == 0 && eventCount == 0

    /**
     * Remplissage de la barre de charge, de 0 à 1 : [minutes] sur la capacité, ou sur [PlanWeek.LOAD_SCALE_MINUTES]
     * un jour sans capacité (week-end), pour qu'une charge s'y voie quand même.
     */
    val load: Float
        get() = (minutes.toFloat() / (capacityMinutes.takeIf { it > 0 } ?: PlanWeek.LOAD_SCALE_MINUTES)).coerceIn(0f, 1f)
}

/** Filtres du tiroir, dans l'ordre de l'écran. */
internal enum class TrayFilter { TO_PLACE, WEEK, MONTH, LATER }

/** Le tiroir : les tâches de chaque filtre (jamais vides dans [filters], qui ne garde que les filtres non vides). */
internal data class Tray(val tasks: Map<TrayFilter, List<TaskItem>>) {
    val filters: List<TrayFilter> get() = TrayFilter.entries.filter { tasks[it].orEmpty().isNotEmpty() }
    val total: Int get() = tasks.values.sumOf { it.size }
}

/** Un choix de la feuille d'une tâche. */
internal sealed interface PlanChoice {
    /** Prévoir la tâche ce jour (ligne du plan ; l'échéance ne bouge pas). [free] : jour libre, montré « libre ». */
    data class Day(val date: LocalDate, val free: Boolean = false) : PlanChoice
    data class ToHorizon(val horizon: Horizon) : PlanChoice
    data object PickDate : PlanChoice
    data object Done : PlanChoice
    data object Open : PlanChoice
    data object Drop : PlanChoice
}

/** Les choix d'une tâche, en deux groupes : [whenChoices] (« Quand ») et [other] (« Autre »). */
internal data class PlanChoices(val whenChoices: List<PlanChoice>, val other: List<PlanChoice>)

internal object PlanWeek {
    const val DAYS = 7

    /** Pages de la bande : cette semaine et la suivante, les 14 jours connus du plan (`PlanBoard.DAYS`). */
    const val LAST_PAGE = 1

    /** Échelle de la barre de charge d'un jour sans capacité : une journée de 8 h. */
    const val LOAD_SCALE_MINUTES = 8 * 60

    /** Capacité d'un jour : la durée des heures de travail un jour ouvré, 0 sinon. */
    fun capacity(hours: WorkingHours, date: LocalDate): Int =
        if (hours.isWorkday(date)) hours.endMinute - hours.startMinute else 0

    /** Premier jour de la bande à la page [page] (0 : aujourd'hui, 1 : les 7 jours suivants, -1 : les 7 d'avant). */
    fun start(today: LocalDate, page: Int): LocalDate = today.plusDays(DAYS.toLong() * page)

    /**
     * Les 7 jours à partir de [start] : tâches et minutes de [days] (les jours absents comptent 0), capacité par
     * [capacity], événements de [events] qui touchent le jour dans [zone] (journée entière comprise).
     */
    fun days(
        start: LocalDate,
        days: List<PlanDay>,
        events: List<EventWithDone>,
        zone: ZoneId,
        capacity: (LocalDate) -> Int,
    ): List<WeekDay> = (0 until DAYS).map { offset ->
        val date = start.plusDays(offset.toLong())
        val range = TimeRange.ofDays(date, 1, zone)
        val dayEvents = events.filter { it.event.overlaps(range, zone) }
        val day = days.firstOrNull { it.date == date }
        WeekDay(
            date = date,
            taskCount = day?.open?.size ?: 0,
            minutes = day?.minutes ?: 0,
            capacityMinutes = capacity(date),
            eventCount = dayEvents.size,
            eventColors = dayEvents.take(3).map(::eventColor),
        )
    }

    /**
     * Le tiroir, chaque tâche une fois : TO_PLACE = [unsorted] puis `toSchedule.stale` ; WEEK = horizons WEEK puis
     * `toSchedule.week` ; MONTH = THIS_MONTH puis `toSchedule.month` ; LATER = NEXT_WEEK, NEXT_MONTH puis SOMEDAY.
     * Une tâche déjà dans un filtre précédent n'est pas répétée.
     */
    fun tray(unsorted: List<TaskItem>, horizons: PlanHorizons, toSchedule: ToSchedule): Tray {
        val seen = HashSet<String>()
        fun take(tasks: List<TaskItem>): List<TaskItem> = tasks.filter { seen.add(it.uid) }
        fun bucket(horizon: Horizon): List<TaskItem> = horizons.buckets[horizon].orEmpty()
        return Tray(
            mapOf(
                TrayFilter.TO_PLACE to take(unsorted + toSchedule.stale),
                TrayFilter.WEEK to take(bucket(Horizon.WEEK) + toSchedule.week),
                TrayFilter.MONTH to take(bucket(Horizon.THIS_MONTH) + toSchedule.month),
                TrayFilter.LATER to take(bucket(Horizon.NEXT_WEEK) + bucket(Horizon.NEXT_MONTH) + bucket(Horizon.SOMEDAY)),
            ),
        )
    }

    /**
     * Choix d'une tâche : Quand = Aujourd'hui, Demain, puis les jours libres de [week] après demain (deux au plus,
     * `free = true`), puis les horizons WEEK, NEXT_WEEK, THIS_MONTH, NEXT_MONTH, SOMEDAY, puis PickDate. Une série
     * (récurrente) n'a pas d'horizons. Autre = Done, Open, puis Drop sauf pour une tâche de fichier (`fileBacked`).
     */
    fun choices(task: TaskItem, today: LocalDate, week: List<WeekDay>): PlanChoices {
        val tomorrow = today.plusDays(1)
        val freeDays = week.filter { it.free && it.date.isAfter(tomorrow) }.take(2)
            .map { PlanChoice.Day(it.date, free = true) }
        val whenChoices = buildList<PlanChoice> {
            add(PlanChoice.Day(today))
            add(PlanChoice.Day(tomorrow))
            addAll(freeDays)
            // Même règle que le choix de date : ni série, ni sous-tâche, ni occurrence virtuelle.
            if (PlanBoard.canTakeHorizon(task)) addAll(Horizon.entries.map { PlanChoice.ToHorizon(it) })
            add(PlanChoice.PickDate)
        }
        val other = buildList<PlanChoice> {
            add(PlanChoice.Done)
            add(PlanChoice.Open)
            if (!task.fileBacked) add(PlanChoice.Drop)
        }
        return PlanChoices(whenChoices, other)
    }

    /**
     * Les lignes du jour [day] pour la liste « façon Aujourd'hui » : ses cartes ouvertes et les événements de [events]
     * de ce jour, à heure d'abord dans l'ordre des heures (journée entière en tête), puis les cartes sans heure dans
     * l'ordre de `day.open`.
     */
    fun dayItems(day: PlanDay, events: List<EventWithDone>, zone: ZoneId): List<PlanDayItem> {
        val range = TimeRange.ofDays(day.date, 1, zone)
        val (allDay, timed) = events.filter { it.event.overlaps(range, zone) }.partition { it.event.allDay }
        // Événements avant les cartes à la même minute : l'agenda est fixe, la liste du plan s'ajuste.
        val timedItems: List<Pair<Int, PlanDayItem>> =
            timed.map { item ->
                val startMillis = maxOf(item.event.localStart(zone), range.startMillis)
                minuteOfDay(startMillis, zone) to PlanDayItem.Event(item)
            } + day.open.mapNotNull { card ->
                card.startMinute(zone)?.let { it to PlanDayItem.Card(card, it) }
            }
        val anytime = day.open.filter { it.startMinute(zone) == null }.map { PlanDayItem.Card(it, null) }
        return allDay.map { PlanDayItem.Event(it) } + timedItems.sortedBy { it.first }.map { it.second } + anytime
    }

    private fun minuteOfDay(epochMillis: Long, zone: ZoneId): Int =
        Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalTime().let { it.hour * 60 + it.minute }

    private fun eventColor(item: EventWithDone): Int =
        item.event.colorArgb.takeIf { it != 0 } ?: item.calendar.colorArgb
}

/** Une ligne du jour choisi : une carte de tâche (avec sa minute de début si elle en a une) ou un événement. */
internal sealed interface PlanDayItem {
    data class Card(val card: PlanCard, val startMinute: Int?) : PlanDayItem
    data class Event(val event: EventWithDone) : PlanDayItem
}
