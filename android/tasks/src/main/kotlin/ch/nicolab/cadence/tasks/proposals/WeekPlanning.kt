package ch.nicolab.cadence.tasks.proposals

import java.time.DayOfWeek
import java.time.LocalDate

/** Quand Aujourd'hui montre le lien « Planifier ma semaine (IA) ». */
internal object WeekPlanning {
    /** Le dimanche et le lundi, jours où l'on prépare la semaine, ou dès qu'une proposition est en cours ou prête. */
    fun linkVisible(today: LocalDate, phase: ProposalPhase): Boolean =
        phase !is ProposalPhase.Idle || today.dayOfWeek == DayOfWeek.SUNDAY || today.dayOfWeek == DayOfWeek.MONDAY
}
