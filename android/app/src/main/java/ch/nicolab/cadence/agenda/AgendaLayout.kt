package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localEnd
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters

/** Hauteur visuelle minimale d'un bloc horaire : un élément court doit rester lisible et touchable. */
internal const val MIN_BLOCK_MINUTES = 30
private const val MINUTES_PER_DAY = 24 * 60

/** Au-delà de trois pastilles, la case d'un jour ne distingue plus rien : le détail est dans la liste. */
const val MAX_DOTS_PER_DAY = 3

/**
 * Élément de l'agenda, déjà placé dans le fuseau de l'appareil : la mise en page n'a donc pas
 * besoin de fuseau. Fin exclusive ; une journée entière va de minuit à minuit du lendemain.
 */
sealed interface AgendaEntry {
    val title: String
    val start: LocalDateTime
    val end: LocalDateTime
    val allDay: Boolean
    val done: Boolean
    val colorArgb: Int?

    data class Event(
        val eventKey: EventInstanceKey,
        val calendarName: String,
        override val title: String,
        override val start: LocalDateTime,
        override val end: LocalDateTime,
        override val allDay: Boolean,
        override val done: Boolean,
        override val colorArgb: Int,
        val location: String? = null,
        val description: String? = null,
    ) : AgendaEntry

    /** Tâche datée : sans heure c'est une entrée de journée ; avec heure, un instant (fin = début). */
    data class Task(
        val uid: String,
        override val title: String,
        override val start: LocalDateTime,
        override val end: LocalDateTime,
        override val allDay: Boolean,
        override val done: Boolean,
        override val colorArgb: Int?,
        /** Estimation de la tâche : durée de son bloc sur la grille. */
        val estimateMinutes: Int? = null,
        /** Une récurrente ne se déplace pas par simple dépôt : elle demande un périmètre. */
        val recurring: Boolean = false,
    ) : AgendaEntry

    /** Habitude prévue ce jour-là : dans la rangée de la journée, ou à l'heure de début de son groupe. */
    data class Habit(
        val habitId: String,
        override val title: String,
        override val start: LocalDateTime,
        override val end: LocalDateTime,
        override val allDay: Boolean,
        override val done: Boolean,
        override val colorArgb: Int?,
    ) : AgendaEntry
}

/** Bloc horaire : minutes depuis minuit, colonne et nombre de colonnes du groupe qui se chevauche. */
data class TimedBlock(
    val entry: AgendaEntry,
    val startMinute: Int,
    val endMinute: Int,
    val column: Int,
    val columnCount: Int,
)

data class DayLayout(
    val allDay: List<AgendaEntry>,
    val timed: List<TimedBlock>,
)

/** Éléments d'une journée, pour la liste sous le mois ou la vue Liste. */
data class AgendaDay(
    val date: LocalDate,
    val entries: List<AgendaEntry>,
)

/**
 * Mise en page d'une journée : d'abord la rangée des journées entières, puis les blocs horaires
 * bornés au jour. Un élément qui chevauche minuit apparaît sur chaque jour qu'il touche.
 */
fun layoutDay(entries: List<AgendaEntry>, day: LocalDate): DayLayout {
    val touching = entries.filter { it.touches(day) }
    val allDay = touching.filter { it.allDay }.sortedWith(ENTRY_ORDER)
    val blocks = touching.filterNot { it.allDay }.map { blockOf(it, day) }
    return DayLayout(allDay = allDay, timed = packColumns(blocks))
}

/** Grille du mois : semaines complètes, 5 ou 6 lignes, à partir du premier jour de semaine. */
fun monthGrid(month: YearMonth, firstDayOfWeek: DayOfWeek = DayOfWeek.MONDAY): List<LocalDate> {
    val first = month.atDay(1).with(TemporalAdjusters.previousOrSame(firstDayOfWeek))
    val last = month.atEndOfMonth().with(TemporalAdjusters.nextOrSame(firstDayOfWeek.minus(1)))
    val count = ChronoUnit.DAYS.between(first, last).toInt() + 1
    return List(count) { first.plusDays(it.toLong()) }
}

/** Les sept jours de la semaine qui contient [day]. */
fun weekDays(day: LocalDate, firstDayOfWeek: DayOfWeek = DayOfWeek.MONDAY): List<LocalDate> {
    val first = day.with(TemporalAdjusters.previousOrSame(firstDayOfWeek))
    return List(7) { first.plusDays(it.toLong()) }
}

/** Jour affiché après un pas de navigation : un jour, trois jours, un mois ou une liste, selon la vue. */
fun stepDate(mode: AgendaMode, selected: LocalDate, direction: Int, weekends: Boolean): LocalDate = when (mode) {
    AgendaMode.DAY -> {
        var next = selected.plusDays(direction.toLong())
        while (!weekends && next.isWeekend()) next = next.plusDays(direction.toLong())
        next
    }
    AgendaMode.THREE_DAYS -> selected.plusDays(3L * direction)
    AgendaMode.MONTH -> selected.plusMonths(direction.toLong())
    AgendaMode.LIST -> selected.plusDays(AGENDA_LIST_DAYS.toLong() * direction)
}

/** Les trois jours de la vue « 3 jours » : les week-ends masqués sont sautés. */
fun threeDays(from: LocalDate, weekends: Boolean): List<LocalDate> {
    val days = mutableListOf<LocalDate>()
    var day = from
    while (days.size < 3) {
        if (weekends || !day.isWeekend()) days += day
        day = day.plusDays(1)
    }
    return days
}

/** Jusqu'à [MAX_DOTS_PER_DAY] éléments par jour, pour les pastilles colorées du mois. */
fun dotsByDay(entries: List<AgendaEntry>): Map<LocalDate, List<AgendaEntry>> {
    val byDay = mutableMapOf<LocalDate, MutableList<AgendaEntry>>()
    // Une habitude quotidienne noierait les pastilles : elles restent dans la liste du jour.
    for (entry in entries.filterNot { it is AgendaEntry.Habit }.sortedWith(ENTRY_ORDER)) {
        var day = entry.start.toLocalDate()
        val last = entry.lastDay()
        while (!day.isAfter(last)) {
            byDay.getOrPut(day) { mutableListOf() }.add(entry)
            day = day.plusDays(1)
        }
    }
    return byDay.mapValues { (_, dayEntries) -> dayEntries.take(MAX_DOTS_PER_DAY) }
}

/** Liste groupée par date sur [days] jours à partir de [from] ; les jours vides n'apparaissent pas. */
fun listGroups(entries: List<AgendaEntry>, from: LocalDate, days: Int): List<AgendaDay> {
    val sorted = entries.sortedWith(ENTRY_ORDER)
    return (0 until days).mapNotNull { offset ->
        val date = from.plusDays(offset.toLong())
        sorted.filter { it.touches(date) }
            .takeIf { it.isNotEmpty() }
            ?.let { AgendaDay(date, it) }
    }
}

/** Élément d'agenda depuis un événement de l'appareil, couleur de l'événement sinon celle de son agenda. */
fun agendaEvent(item: EventWithDone, zone: ZoneId): AgendaEntry.Event = AgendaEntry.Event(
    eventKey = item.event.key,
    calendarName = item.calendar.displayName,
    title = item.event.title,
    start = item.event.localStart(zone).toLocalDateTime(zone),
    end = item.event.localEnd(zone).toLocalDateTime(zone),
    allDay = item.event.allDay,
    done = item.done,
    colorArgb = item.event.colorArgb.takeIf { it != 0 } ?: item.calendar.colorArgb,
    location = item.event.location,
    description = item.event.description,
)

/** Tâche datée ; null sans échéance. Sans heure, l'échéance vaut pour son jour civil (`dueDay`). */
fun agendaTask(task: TaskItem, projectColorArgb: Int?, zone: ZoneId): AgendaEntry.Task? {
    val due = task.dueDate ?: return null
    val estimate = task.estimatedMinutes?.takeIf { it > 0 }
    if (task.dueHasTime) {
        val at = LocalDateTime.ofInstant(due, zone)
        return AgendaEntry.Task(
            uid = task.uid,
            title = task.name,
            start = at,
            end = if (estimate != null) at.plusMinutes(estimate.toLong()) else at,
            allDay = false,
            done = task.isClosed,
            colorArgb = projectColorArgb,
            estimateMinutes = estimate,
            recurring = task.isRecurring,
        )
    }
    val day = task.dueDay ?: due.atZone(zone).toLocalDate()
    return AgendaEntry.Task(
        uid = task.uid,
        title = task.name,
        start = day.atStartOfDay(),
        end = day.plusDays(1).atStartOfDay(),
        allDay = true,
        done = task.isClosed,
        colorArgb = projectColorArgb,
        estimateMinutes = estimate,
        recurring = task.isRecurring,
    )
}

/** Tâche à heure rangée dans la rangée des journées entières, quand les tâches avec heure sont masquées. */
fun AgendaEntry.Task.withoutTime(): AgendaEntry.Task {
    val day = start.toLocalDate()
    return copy(start = day.atStartOfDay(), end = day.plusDays(1).atStartOfDay(), allDay = true)
}

/** Couleur d'un projet Tududi (`#RRGGBB`) ; null si elle n'est pas lisible, l'élément prend alors l'accent. */
fun parseProjectColor(value: String?): Int? {
    val hex = value?.trim()?.removePrefix("#") ?: return null
    if (hex.length != 6) return null
    val rgb = hex.toIntOrNull(16) ?: return null
    return (0xFF000000L or rgb.toLong()).toInt()
}

private val ENTRY_ORDER: Comparator<AgendaEntry> = compareByDescending<AgendaEntry> { it.allDay }
    .thenBy { it.start }
    .thenBy { it.title.lowercase() }

/** Dernier jour touché, fin exclusive : une fin à minuit ne compte pas pour le jour suivant. */
private fun AgendaEntry.lastDay(): LocalDate =
    if (end > start && end.toLocalTime() == LocalTime.MIDNIGHT) end.toLocalDate().minusDays(1) else end.toLocalDate()

private fun AgendaEntry.touches(day: LocalDate): Boolean =
    !day.isBefore(start.toLocalDate()) && !day.isAfter(lastDay())

/** Bloc d'un élément borné au jour, avec une hauteur minimale ; les éléments de durée nulle gardent la même règle. */
private fun blockOf(entry: AgendaEntry, day: LocalDate): TimedBlock {
    val dayStart = day.atStartOfDay()
    val dayEnd = day.plusDays(1).atStartOfDay()
    val startMinute = Duration.between(dayStart, maxOf(entry.start, dayStart)).toMinutes().toInt()
    val endMinute = Duration.between(dayStart, minOf(entry.end, dayEnd)).toMinutes().toInt()
    val visualStart = startMinute.coerceAtMost(MINUTES_PER_DAY - MIN_BLOCK_MINUTES)
    val visualEnd = maxOf(endMinute, visualStart + MIN_BLOCK_MINUTES).coerceAtMost(MINUTES_PER_DAY)
    return TimedBlock(entry, visualStart, visualEnd, column = 0, columnCount = 1)
}

/**
 * Répartition gloutonne en colonnes : un groupe de blocs qui se chevauchent en chaîne partage
 * la même largeur, chaque bloc prend la première colonne libre à son début.
 */
private fun packColumns(blocks: List<TimedBlock>): List<TimedBlock> {
    val sorted = blocks.sortedWith(
        compareBy<TimedBlock> { it.startMinute }
            .thenByDescending { it.endMinute }
            .thenBy { it.entry.title.lowercase() },
    )
    val placed = mutableListOf<TimedBlock>()
    var group = mutableListOf<TimedBlock>()
    var columnEnds = mutableListOf<Int>()
    var groupEnd = 0
    for (block in sorted) {
        if (group.isNotEmpty() && block.startMinute >= groupEnd) {
            placed += group.map { it.copy(columnCount = columnEnds.size) }
            group = mutableListOf()
            columnEnds = mutableListOf()
        }
        val free = columnEnds.indexOfFirst { it <= block.startMinute }
        val column = if (free >= 0) free else columnEnds.size
        if (column == columnEnds.size) columnEnds += block.endMinute else columnEnds[column] = block.endMinute
        group += block.copy(column = column)
        groupEnd = maxOf(groupEnd, block.endMinute)
    }
    placed += group.map { it.copy(columnCount = columnEnds.size) }
    return placed.sortedWith(compareBy<TimedBlock> { it.startMinute }.thenBy { it.column })
}

private fun Long.toLocalDateTime(zone: ZoneId): LocalDateTime =
    Instant.ofEpochMilli(this).atZone(zone).toLocalDateTime()
