package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "habit_entries",
    foreignKeys = [
        ForeignKey(
            entity = HabitEntity::class,
            parentColumns = ["id"],
            childColumns = ["habitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index("habitId"),
        Index(value = ["habitId", "localDate"]),
    ],
)
data class HabitEntryEntity(
    @PrimaryKey val id: String,
    val habitId: String,
    val occurredAtEpochMs: Long,
    val localDate: String,
    val observedZoneId: String,
    val valueMinor: Long,
    val source: String,
)
