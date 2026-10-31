package ch.nicolab.cadence.tasks.model

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId

/**
 * Règle d'une série telle que le serveur la stocke (`recurrence_*`, `completion_based`) ; le type
 * ([TaskItem.recurrenceType]) reste sur la tâche. Jours de semaine : 0 = dimanche, comme le serveur.
 */
data class RecurrenceRule(
    val interval: Int = 1,
    val weekday: Int? = null,
    val weekdays: List<Int> = emptyList(),
    val monthDay: Int? = null,
    val weekOfMonth: Int? = null,
    /** Dernier jour de la série, inclus. */
    val endDay: LocalDate? = null,
    /** Jours retirés de la série (déplacés ou sautés) : la série les enjambe sans les afficher. */
    val exdates: Set<LocalDate> = emptySet(),
    /** « Après complétion » : la date suivante dépend du jour où la tâche sera faite, donc inconnue d'avance. */
    val completionBased: Boolean = false,
)

/**
 * Occurrences à venir d'une tâche récurrente ouverte, pour l'agenda. Même règles que
 * `calculateVirtualOccurrences` du serveur (`recurringTaskService.js`, docs/01-recurring-tasks-behavior.md),
 * calculées en jours civils de l'appareil : l'heure d'horloge et la durée (estimation) restent celles de la
 * tâche, quel que soit le changement d'heure. Écarts voulus avec le serveur : la plage demandée borne la
 * série (le plafond compte les occurrences rendues, pas les pas depuis l'échéance) et le dernier jour de la
 * série est inclus.
 */
object RecurrenceExpansion {
    const val MAX_OCCURRENCES = 100

    /** Garde-fou contre une série qui n'avance pas ; une série quotidienne en retard de plusieurs années reste couverte. */
    private const val MAX_STEPS = 5000

    /**
     * Occurrences de [task] entre [from] et [to] inclus, sans l'occurrence enregistrée (celle de l'échéance de
     * la tâche, déjà affichée). Chacune est une copie de la tâche à son jour et à son heure ; vide pour une tâche
     * close, sans échéance, à règle inconnue ou « après complétion ».
     */
    fun expand(task: TaskItem, from: LocalDate, to: LocalDate, zone: ZoneId, cap: Int = MAX_OCCURRENCES): List<TaskItem> {
        val rule = task.recurrence
        val due = task.dueDate
        val type = task.recurrenceType
        if (!task.isRecurring || task.isClosed || rule.completionBased || due == null || type !in SUPPORTED) return emptyList()
        val time = if (task.dueHasTime) due.atZone(zone).toLocalTime() else null
        var current = task.dueDay ?: due.atZone(zone).toLocalDate()
        val result = mutableListOf<TaskItem>()
        var steps = 0
        while (result.size < cap && steps < MAX_STEPS) {
            val next = nextDay(type, rule, current)
            if (next == null || !next.isAfter(current)) break
            current = next
            steps++
            if (current.isAfter(to) || rule.endDay?.let { current.isAfter(it) } == true) break
            if (current.isBefore(from) || current in rule.exdates) continue
            result += occurrence(task, current, time, zone)
        }
        return result
    }

    private val SUPPORTED = setOf("daily", "weekly", "monthly", "monthly_weekday", "monthly_last_day")

    private fun occurrence(task: TaskItem, day: LocalDate, time: LocalTime?, zone: ZoneId): TaskItem {
        // `atZone` replace une heure tombée dans le saut du printemps par la suivante, et garde la première de l'automne.
        val at = (time?.let { day.atTime(it) } ?: day.atTime(LocalTime.MAX)).atZone(zone).toInstant()
        return task.copy(dueDate = at, dueDay = day)
    }

    private fun nextDay(type: String?, rule: RecurrenceRule, from: LocalDate): LocalDate? {
        val interval = rule.interval.coerceAtLeast(1)
        return when (type) {
            "daily" -> from.plusDays(interval.toLong())
            "weekly" -> from.plusDays(weeklyStep(rule, interval, from).toLong())
            "monthly" -> monthly(from, interval, rule.monthDay)
            "monthly_weekday" -> monthlyWeekday(from, interval, rule.weekday, rule.weekOfMonth)
            "monthly_last_day" -> YearMonth.from(from).plusMonths(interval.toLong()).atEndOfMonth()
            else -> null
        }
    }

    private fun DayOfWeek.sunday0(): Int = value % 7

    private fun weeklyStep(rule: RecurrenceRule, interval: Int, from: LocalDate): Int {
        val currentDay = from.dayOfWeek.sunday0()
        val sorted = rule.weekdays.sorted()
        if (sorted.isNotEmpty()) {
            val daysToNext = (1..7).firstOrNull { (currentDay + it) % 7 in sorted } ?: return interval * 7
            if (daysToNext == 7) return daysToNext + (interval - 1) * 7
            // Dernier jour du motif (ou dimanche) : on saute les semaines que l'intervalle exclut.
            val endsCycle = currentDay == sorted.max() || currentDay == 0
            return if (interval > 1 && daysToNext != 1 && endsCycle) daysToNext + (interval - 1) * 7 else daysToNext
        }
        val weekday = rule.weekday ?: return interval * 7
        val until = (weekday - currentDay + 7) % 7
        return when {
            until == 0 -> interval * 7
            interval > 1 -> until + (interval - 1) * 7
            else -> until
        }
    }

    private fun monthly(from: LocalDate, interval: Int, monthDay: Int?): LocalDate {
        val target = YearMonth.from(from).plusMonths(interval.toLong())
        val wanted = when {
            monthDay == null || monthDay == 0 -> from.dayOfMonth
            monthDay < 0 -> target.lengthOfMonth()
            else -> monthDay
        }
        return target.atDay(wanted.coerceAtMost(target.lengthOfMonth()))
    }

    private fun monthlyWeekday(from: LocalDate, interval: Int, weekday: Int?, weekOfMonth: Int?): LocalDate {
        // Comme le serveur : « mois + intervalle » garde le quantième, et un jour 29-31 déborde sur le mois suivant.
        val month = YearMonth.from(from.withDayOfMonth(1).plusMonths(interval.toLong()).plusDays(from.dayOfMonth - 1L))
        val wantedDay = weekday ?: from.dayOfWeek.sunday0()
        val week = weekOfMonth ?: ((from.dayOfMonth - 1) / 7 + 1)
        if (week < 1) {
            val last = month.atEndOfMonth()
            return last.minusDays(((last.dayOfWeek.sunday0() - wantedDay + 7) % 7).toLong())
        }
        val first = month.atDay(1).plusDays(((wantedDay - month.atDay(1).dayOfWeek.sunday0() + 7) % 7).toLong())
        val target = first.plusWeeks(week - 1L)
        return if (YearMonth.from(target) != month) target.minusWeeks(1) else target
    }
}
