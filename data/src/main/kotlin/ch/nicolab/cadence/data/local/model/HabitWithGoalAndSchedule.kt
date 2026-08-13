package ch.nicolab.cadence.data.local.model

import androidx.room.Embedded
import androidx.room.Relation
import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity

data class HabitWithGoalAndSchedule(
    @Embedded val habit: HabitEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "habitId",
    )
    val goals: List<HabitGoalEntity>,
    @Relation(
        parentColumn = "id",
        entityColumn = "habitId",
    )
    val schedules: List<HabitScheduleEntity>,
)
