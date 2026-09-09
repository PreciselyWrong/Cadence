package ch.nicolab.cadence.domain

import java.time.Duration
import java.time.Instant

/**
 * Durée écoulée depuis le début de la période d'abstinence en cours.
 *
 * Décomposée en jours entiers et en heures/minutes/secondes résiduelles.
 */
data class AbstinenceElapsed(
    val days: Long,
    val hours: Int,
    val minutes: Int,
    val seconds: Int,
) {
    init {
        require(days >= 0L) { "Days must be non-negative" }
        require(hours in 0..23) { "Hours must be in 0..23" }
        require(minutes in 0..59) { "Minutes must be in 0..59" }
        require(seconds in 0..59) { "Seconds must be in 0..59" }
    }

    /**
     * Format compact adapté aux espaces restreints (ex. widget Android étroit).
     *
     * Moins d'un jour : "8 h 12"
     * À partir d'un jour : "23 j 8 h"
     */
    fun formatCompact(): String = if (days < 1L) {
        "$hours h $minutes min"
    } else {
        "$days j $hours h"
    }

    companion object {
        val ZERO = AbstinenceElapsed(0L, 0, 0, 0)

        fun from(duration: Duration): AbstinenceElapsed {
            if (duration.isNegative || duration.isZero) return ZERO
            val totalSeconds = duration.seconds
            val days = totalSeconds / 86400L
            val remDay = totalSeconds % 86400L
            val hours = (remDay / 3600L).toInt()
            val remHour = remDay % 3600L
            val minutes = (remHour / 60L).toInt()
            val seconds = (remHour % 60L).toInt()
            return AbstinenceElapsed(days, hours, minutes, seconds)
        }

    }
}

object AbstinenceElapsedCalculator {

    fun calculate(
        habitId: String,
        declaredStart: Instant,
        occurrences: List<HabitEntry>,
        now: Instant,
    ): AbstinenceElapsed {
        val activeStart = activeStart(habitId, declaredStart, occurrences)

        if (activeStart > now) return AbstinenceElapsed.ZERO
        return AbstinenceElapsed.from(Duration.between(activeStart, now))
    }

    fun activeStart(habitId: String, declaredStart: Instant, occurrences: List<HabitEntry>): Instant {
        val latestOccurrence = occurrences
            .filter { it.habitId == habitId }
            .maxByOrNull { it.occurredAt }
            ?.occurredAt
        return if (latestOccurrence != null && latestOccurrence > declaredStart) {
            latestOccurrence
        } else {
            declaredStart
        }
    }
}
