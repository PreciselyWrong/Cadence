package ch.nicolab.cadence.domain

import java.time.Duration
import java.time.Instant

/**
 * Avance d'un rappel sur l'heure de la tâche ou de l'événement : le même choix pour les deux,
 * chacun gardant sa valeur (tâches « à l'heure », événements 10 min avant).
 */
enum class ReminderLead(val minutes: Long) {
    AT_TIME(0),
    FIVE_MINUTES(5),
    TEN_MINUTES(10),
    FIFTEEN_MINUTES(15),
    THIRTY_MINUTES(30);

    val duration: Duration get() = Duration.ofMinutes(minutes)

    /** Instant où sonner pour un début à [start]. */
    fun notifyAt(start: Instant): Instant = start.minus(duration)

    companion object {
        /** Valeur enregistrée relue ; une valeur inconnue retombe sur [fallback]. */
        fun ofMinutes(minutes: Long, fallback: ReminderLead): ReminderLead =
            entries.firstOrNull { it.minutes == minutes } ?: fallback
    }
}
