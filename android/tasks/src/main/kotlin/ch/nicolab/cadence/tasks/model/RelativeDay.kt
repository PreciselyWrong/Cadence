package ch.nicolab.cadence.tasks.model

import java.time.LocalDate

/**
 * Position d'une date par rapport à aujourd'hui : l'application et le widget choisissent le
 * même mot (Hier, Aujourd'hui, Demain) et ne diffèrent que par sa longueur.
 */
enum class RelativeDay {
    YESTERDAY,
    TODAY,
    TOMORROW,
    OTHER,
    ;

    companion object {
        fun of(date: LocalDate, today: LocalDate): RelativeDay = when (date) {
            today.minusDays(1) -> YESTERDAY
            today -> TODAY
            today.plusDays(1) -> TOMORROW
            else -> OTHER
        }
    }
}
