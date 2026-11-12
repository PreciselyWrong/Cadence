package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.roundToInt

/** Jours réussis sur jours comptés ; pas de taux sans jour compté. */
data class HabitPatternTally(val done: Int, val counted: Int) {
    val ratePercent: Int?
        get() = if (counted == 0) null else (done * 100.0 / counted).roundToInt()
}

/**
 * Motifs d'une année de statuts ([HabitStatisticsSummary.calendarDays]) : les jours de la semaine et les mois où
 * l'habitude tient. Jumeau de `backend/modules/habits/cadence/patterns.js`, cas dorés `fixtures/habits/patterns.json`.
 */
data class HabitPatterns(
    val weekdays: List<Pair<DayOfWeek, HabitPatternTally>>,
    val months: List<Pair<YearMonth, HabitPatternTally>>,
    val year: HabitPatternTally,
) {
    companion object {
        private val DONE = setOf(HabitStatisticsDayStatus.MINIMUM, HabitStatisticsDayStatus.IDEAL, HabitStatisticsDayStatus.ACTIVITY)
        private val MISSED = setOf(HabitStatisticsDayStatus.MISSED, HabitStatisticsDayStatus.NO_ACTIVITY)

        /** Aujourd'hui, encore ouvert, ne compte qu'une fois réussi : le matin ne se lit jamais comme un échec. */
        fun compute(days: List<HabitStatisticsDay>, today: LocalDate): HabitPatterns {
            val weekdays = DayOfWeek.entries.associateWith { intArrayOf(0, 0) }
            val months = sortedMapOf<YearMonth, IntArray>()
            val year = intArrayOf(0, 0)
            for (day in days) {
                val month = months.getOrPut(YearMonth.from(day.date)) { intArrayOf(0, 0) }
                val done = day.status in DONE
                if (!done && !(day.status in MISSED && day.date < today)) continue
                for (tally in listOf(weekdays.getValue(day.date.dayOfWeek), month, year)) {
                    tally[1] += 1
                    if (done) tally[0] += 1
                }
            }
            fun IntArray.tally() = HabitPatternTally(this[0], this[1])
            return HabitPatterns(
                weekdays = weekdays.map { (day, t) -> day to t.tally() },
                months = months.map { (month, t) -> month to t.tally() },
                year = year.tally(),
            )
        }
    }
}
