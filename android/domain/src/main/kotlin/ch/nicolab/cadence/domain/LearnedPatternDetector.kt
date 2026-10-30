package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Une saisie vue par la détection : sa date civile observée et, si connue, sa minute locale (0..1439). */
data class ObservedLog(val localDate: LocalDate, val minuteOfDay: Int? = null) {
    init {
        require(minuteOfDay == null || minuteOfDay in 0..1439) { "Minute of day must fall within a civil day" }
    }

    companion object {
        /** La date civile et l'heure viennent du fuseau observé : recalculées depuis l'instant UTC, elles basculeraient de jour. */
        fun of(entry: HabitEntry): ObservedLog =
            ObservedLog(entry.localDate, minuteOfDay(entry.occurredAt, entry.observedZoneId))

        fun of(consumption: AlcoholConsumption): ObservedLog =
            ObservedLog(
                consumption.localDate,
                consumption.observedAt?.let { minuteOfDay(it, consumption.observedZoneId) },
            )

        private fun minuteOfDay(instant: Instant, zone: ZoneId): Int {
            val local = instant.atZone(zone)
            return local.hour * 60 + local.minute
        }
    }
}

data class WeekdayShare(
    val weekday: DayOfWeek,
    val hits: Int,
    val observed: Int,
    val usualMinuteOfDay: Int?,
) {
    /** Comparaison entière : évite les arrondis d'un pourcentage flottant au seuil exact. */
    fun reaches(thresholdPercent: Int, minObserved: Int): Boolean =
        observed >= minObserved && hits * 100 >= thresholdPercent * observed
}

data class LearnedPattern(
    val untilExclusive: LocalDate,
    val weeks: Int,
    /** Toujours les sept jours de la semaine. */
    val weekdays: Map<DayOfWeek, WeekdayShare>,
    val usualMinuteOfDay: Int?,
) {
    fun share(weekday: DayOfWeek): WeekdayShare = weekdays.getValue(weekday)
}

object LearnedPatternDetector {
    const val DEFAULT_WEEKS = 12

    /**
     * Fenêtre de [weeks] semaines qui se termine avant [untilExclusive]. Un jour non observé
     * (avant le début du suivi ou en pause) ne compte ni comme saisie ni comme jour observé :
     * une pause ne doit pas faire baisser la régularité apprise.
     */
    fun detect(
        logs: List<ObservedLog>,
        untilExclusive: LocalDate,
        trackingSince: LocalDate,
        pauses: List<HabitPause>,
        weeks: Int = DEFAULT_WEEKS,
    ): LearnedPattern {
        require(weeks > 0) { "The pattern window must span at least one week" }
        val windowStart = untilExclusive.minusDays(7L * weeks)
        val windowDays = generateSequence(windowStart) { it.plusDays(1) }
            .takeWhile { it < untilExclusive }
            .toList()
        val observedDays = windowDays
            .filter { it >= trackingSince && pauses.none { pause -> pause.includes(it) } }
            .toSet()
        val logsByDay = logs.filter { it.localDate in observedDays }.groupBy { it.localDate }

        val weekdays = DayOfWeek.entries.associateWith { weekday ->
            val days = windowDays.filter { it.dayOfWeek == weekday && it in observedDays }
            WeekdayShare(
                weekday = weekday,
                hits = days.count { logsByDay.containsKey(it) },
                observed = days.size,
                usualMinuteOfDay = lowerMedian(days.flatMap { logsByDay[it].orEmpty() }.mapNotNull { it.minuteOfDay }),
            )
        }
        return LearnedPattern(
            untilExclusive = untilExclusive,
            weeks = weeks,
            weekdays = weekdays,
            usualMinuteOfDay = lowerMedian(logsByDay.values.flatten().mapNotNull { it.minuteOfDay }),
        )
    }

    /** Médiane basse : pour un nombre pair de saisies, on retient la plus petite des deux centrales. */
    private fun lowerMedian(values: List<Int>): Int? =
        values.takeIf { it.isNotEmpty() }?.sorted()?.let { it[(it.size - 1) / 2] }
}
