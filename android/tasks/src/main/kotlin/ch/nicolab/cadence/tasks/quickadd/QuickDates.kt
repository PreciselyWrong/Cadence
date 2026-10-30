package ch.nicolab.cadence.tasks.quickadd

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

/**
 * Raccourcis de date partagés par la saisie en langage naturel et la feuille de date.
 * Ils suivent ceux du web (`frontend/utils/dateShortcuts.ts`) : le week-end est le prochain
 * samedi (celui de la semaine suivante si l'on est déjà samedi ou dimanche), la semaine
 * prochaine commence le lundi.
 */
object QuickDates {
    private const val DAYS_IN_WEEK = 7

    fun tomorrow(today: LocalDate): LocalDate = today.plusDays(1)

    fun weekend(today: LocalDate): LocalDate = today.plusDays(daysUntil(today, DayOfWeek.SATURDAY).toLong())

    /** Lundi de la semaine suivante. */
    fun nextWeek(today: LocalDate): LocalDate = today.plusDays((DAYS_IN_WEEK + 1 - today.dayOfWeek.value).toLong())

    /** Prochain [day] strictement après [today] : « vendredi » dit un vendredi, on est déjà vendredi, c'est dans 7 jours. */
    fun nextOccurrence(today: LocalDate, day: DayOfWeek): LocalDate = today.plusDays(daysUntil(today, day).toLong())

    /** Ce jour de la semaine suivante : « lundi prochain ». */
    fun inNextWeek(today: LocalDate, day: DayOfWeek): LocalDate = nextWeek(today).plusDays((day.value - 1).toLong())

    private fun daysUntil(today: LocalDate, day: DayOfWeek): Int {
        val gap = (day.value - today.dayOfWeek.value + DAYS_IN_WEEK) % DAYS_IN_WEEK
        return if (gap == 0) DAYS_IN_WEEK else gap
    }
}

/** Grille d'un mois, semaines du lundi au dimanche ; les jours hors mois sont null. */
object MonthGrid {
    fun weeks(month: YearMonth): List<List<LocalDate?>> {
        val first = month.atDay(1)
        val lead = first.dayOfWeek.value - 1
        val cells = List(lead) { null } + (1..month.lengthOfMonth()).map { month.atDay(it) }
        return cells.chunked(DaysPerWeek).map { week -> week + List(DaysPerWeek - week.size) { null } }
    }

    private const val DaysPerWeek = 7
}
