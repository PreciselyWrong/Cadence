package ch.nicolab.cadence.tasks.swipe

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/** Raccourcis de la feuille « Planifier ». */
enum class SchedulePreset {
    TODAY, TOMORROW, WEEKEND, NEXT_WEEK, PICK, NO_DATE;

    companion object {
        /** Jour d'un raccourci ; null pour « Sans date » et « Choisir une date » (à saisir). */
        fun dateFor(preset: SchedulePreset, today: LocalDate, firstDayOfWeek: DayOfWeek): LocalDate? = when (preset) {
            TODAY -> today
            TOMORROW -> today.plusDays(1)
            // Samedi à venir ; un samedi vise le dimanche, un dimanche le week-end suivant.
            WEEKEND -> if (today.dayOfWeek == DayOfWeek.SATURDAY) today.plusDays(1) else today.with(TemporalAdjusters.next(DayOfWeek.SATURDAY))
            NEXT_WEEK -> today.with(TemporalAdjusters.next(firstDayOfWeek))
            PICK, NO_DATE -> null
        }

        /** Report d'une semaine : depuis l'échéance, sans jamais rester dans le passé. */
        fun plusOneWeek(due: LocalDate?, today: LocalDate): LocalDate {
            val base = if (due == null || due.isBefore(today)) today else due
            return base.plusDays(7)
        }
    }
}
