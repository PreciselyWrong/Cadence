package ch.nicolab.cadence.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "habits")
data class HabitEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String? = null,
    val iconId: String? = null,
    val colorArgb: Int? = null,
    val active: Boolean,
    @ColumnInfo(defaultValue = "1970-01-01") val startsOn: String = "1970-01-01",
    @ColumnInfo(defaultValue = "0") val archived: Boolean = false,
    @ColumnInfo(defaultValue = "0") val sortOrder: Int = 0,
    val createdAtEpochMs: Long,
    @ColumnInfo(defaultValue = "0") val updatedAtEpochMs: Long = 0L,
    @ColumnInfo(defaultValue = "group-day") val groupId: String = "group-day",
    /** Mode chronomètre proposé dans la saisie rapide, réservé aux objectifs en durée. */
    @ColumnInfo(defaultValue = "0") val timerEnabled: Boolean = false,
)
