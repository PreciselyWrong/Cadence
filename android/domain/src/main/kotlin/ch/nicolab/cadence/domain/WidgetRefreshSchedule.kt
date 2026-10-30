package ch.nicolab.cadence.domain

import java.time.LocalDateTime
import java.time.LocalTime

/**
 * Instants où l'affichage d'un widget change sans qu'aucune écriture n'ait lieu : le
 * passage à un nouveau jour, et l'entrée ou la sortie d'un groupe horaire en mode
 * automatique. Les réveiller explicitement évite d'attendre le cycle de mise à jour du
 * système, long d'une demi-heure.
 */
object WidgetRefreshSchedule {

    /**
     * Prochain basculement strictement après [now]. Minuit sert de borne haute : il change
     * la journée affichée et rend le résultat toujours défini.
     */
    fun nextBoundary(now: LocalDateTime, groups: List<HabitGroup>, refreshEveryMinutes: Int? = null): LocalDateTime {
        val midnight = now.toLocalDate().plusDays(1).atStartOfDay()
        val nowMinute = now.hour * 60 + now.minute
        val groupBoundary = groups
            .flatMap { listOfNotNull(it.startMinute, it.endMinute) }
            .filter { it > nowMinute }
            .distinct()
            .minOrNull()
            ?.let { minute -> now.toLocalDate().atTime(LocalTime.of(minute / 60, minute % 60)) }
            ?: midnight
        val liveBoundary = refreshEveryMinutes?.takeIf { it > 0 }?.let { interval ->
            val nextMinute = ((nowMinute / interval) + 1) * interval
            if (nextMinute >= 24 * 60) midnight
            else now.toLocalDate().atTime(LocalTime.of(nextMinute / 60, nextMinute % 60))
        } ?: midnight
        return minOf(groupBoundary, liveBoundary)
    }
}
