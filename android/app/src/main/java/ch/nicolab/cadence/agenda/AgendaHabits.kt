package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.isPlannedOn
import java.time.LocalDate

/** Habitude qui peut figurer dans l'agenda : tout sauf l'abstinence, qui n'a pas de jour. */
fun PersistedHabit.isOnAgenda(): Boolean = !goal.isAbstinence

/**
 * Suivi libre ou rythme souple (« N fois par semaine ») : aucun jour n'est dû, l'habitude n'apparaît donc
 * que les jours où elle a été faite, comme `GET /api/cadence/calendar` du serveur.
 */
fun PersistedHabit.appearsOnlyWhenDone(): Boolean =
    goal.isTracker || schedule.mode == ScheduleMode.FLEXIBLE_PERIOD

/**
 * Habitudes prévues sur [days], une entrée par jour. Dans un groupe horaire, l'entrée se place au
 * début du groupe ; sans horaire elle va dans la rangée de la journée. [doneDays] liste les jours
 * avec une saisie ; une limite ne se « fait » pas, elle n'est donc jamais cochée. Un suivi libre ou
 * un rythme souple ne figure que les jours de [doneDays] ; un jour en pause est omis, sauf pour un
 * suivi libre qui reste visible (le serveur évalue le suivi avant la pause).
 */
fun habitAgendaEntries(
    habits: List<PersistedHabit>,
    groups: List<HabitGroup>,
    pauses: Map<String, List<HabitPause>>,
    doneDays: Map<String, Set<LocalDate>>,
    days: List<LocalDate>,
): List<AgendaEntry.Habit> {
    val groupsById = groups.associateBy { it.id }
    return habits.filter { it.isOnAgenda() }.flatMap { habit ->
        val startMinute = groupsById[habit.groupId]?.startMinute
        val onlyWhenDone = habit.appearsOnlyWhenDone()
        days.filter { day ->
            isPlannedOn(habit.definition, day) &&
                (!onlyWhenDone || day in doneDays[habit.id].orEmpty()) &&
                (habit.goal.isTracker || pauses[habit.id].orEmpty().none { it.includes(day) })
        }.map { day ->
            val start = day.atStartOfDay().plusMinutes((startMinute ?: 0).toLong())
            AgendaEntry.Habit(
                habitId = habit.id,
                title = habit.name,
                start = start,
                end = if (startMinute == null) day.plusDays(1).atStartOfDay() else start,
                allDay = startMinute == null,
                done = !habit.goal.isLimit && day in doneDays[habit.id].orEmpty(),
                colorArgb = habit.colorArgb,
            )
        }
    }
}
