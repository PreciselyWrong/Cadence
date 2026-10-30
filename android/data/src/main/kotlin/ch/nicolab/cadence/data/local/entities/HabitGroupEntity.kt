package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Un moment de la journée. `startMinute` et `endMinute` sont nuls ensemble pour un groupe
 * disponible en permanence, comme `Journée`.
 */
@Entity(tableName = "habit_groups")
data class HabitGroupEntity(
    @PrimaryKey val id: String,
    val name: String,
    val startMinute: Int?,
    val endMinute: Int?,
    val sortOrder: Int,
)
