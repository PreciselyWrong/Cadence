package ch.nicolab.cadence.habits

import ch.nicolab.cadence.domain.HabitGroup
import java.time.LocalTime

/** Facettes au plus affichées dans la routine ; au-delà, la liste complète reste dans Habitudes. */
internal const val ROUTINE_FACET_LIMIT = 5

/** État d'une habitude pour la routine d'aujourd'hui. */
internal data class RoutineCandidate(
    val id: String,
    val groupId: String,
    /** Attendue aujourd'hui : planifiée, non suspendue, ni archivée ni de suivi libre. */
    val due: Boolean,
    val done: Boolean,
    /** Entamée sans être terminée. */
    val partial: Boolean,
)

/** Moment courant de la routine : son groupe, son compte et les habitudes à montrer. */
internal data class RoutineMoment(
    val group: HabitGroup,
    val done: Int,
    val due: Int,
    val partial: Int,
    val facetIds: List<String>,
)

/**
 * Choisit le moment de la routine : le premier groupe horaire actif à [time] (ordre choisi par
 * la personne), sinon le groupe `Journée`. Renvoie null quand aucune habitude n'est attendue
 * dans ce moment, pour que la routine disparaisse plutôt que d'afficher du vide.
 */
internal fun selectRoutine(
    groups: List<HabitGroup>,
    candidates: List<RoutineCandidate>,
    time: LocalTime,
): RoutineMoment? {
    val group = HabitGroup.activeAt(groups, time).firstOrNull { !it.isAllDay }
        ?: groups.firstOrNull { it.isAllDay }
        ?: return null
    val due = candidates.filter { it.groupId == group.id && it.due }
    if (due.isEmpty()) return null
    return RoutineMoment(
        group = group,
        done = due.count { it.done },
        due = due.size,
        partial = due.count { it.partial },
        facetIds = due.take(ROUTINE_FACET_LIMIT).map { it.id },
    )
}
