package ch.nicolab.cadence.data.local.model

import ch.nicolab.cadence.domain.HabitDefinition
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitSchedule

data class PersistedHabit(
    val id: String,
    val name: String,
    val active: Boolean,
    val goal: HabitGoal,
    val schedule: HabitSchedule,
) {
    val definition: HabitDefinition get() = HabitDefinition(id, active, goal, schedule)
}
