package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.domain.isPlannedOn
import java.time.LocalDate

/** Habitude ayant un jour prévu : ni suivi libre, ni abstinence, ni rythme souple sans jour fixe. */
fun PersistedHabit.isAgendaScheduled(): Boolean =
    !goal.isTracker && !goal.isAbstinence && schedule.mode != ScheduleMode.FLEXIBLE_PERIOD

/**
 * Habitudes prévues sur [days], une entrée par jour. Dans un groupe horaire, l'entrée se place au
 * début du groupe ; sans horaire elle va dans la rangée de la journée. [doneDays] liste les jours
 * avec une saisie ; une limite ne se « fait » pas, elle n'est donc jamais cochée.
 */
fun habitAgendaEntries(
    habits: List<PersistedHabit>,
    groups: List<HabitGroup>,
    pauses: Map<String, List<HabitPause>>,
    doneDays: Map<String, Set<LocalDate>>,
    days: List<LocalDate>,
): List<AgendaEntry.Habit> {
    val groupsById = groups.associateBy { it.id }
    return habits.filter { it.isAgendaScheduled() }.flatMap { habit ->
        val startMinute = groupsById[habit.groupId]?.startMinute
        days.filter { day ->
            isPlannedOn(habit.definition, day) && pauses[habit.id].orEmpty().none { it.includes(day) }
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
