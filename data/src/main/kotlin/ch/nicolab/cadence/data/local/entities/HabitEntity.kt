package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "habits")
data class HabitEntity(
    @PrimaryKey val id: String,
    val name: String,
    val active: Boolean,
    val createdAtEpochMs: Long,
)
