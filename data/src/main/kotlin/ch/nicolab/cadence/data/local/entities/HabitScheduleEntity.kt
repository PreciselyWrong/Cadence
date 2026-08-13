package ch.nicolab.cadence.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "habit_schedules",
    foreignKeys = [
        ForeignKey(
            entity = HabitEntity::class,
            parentColumns = ["id"],
            childColumns = ["habitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("habitId")],
)
data class HabitScheduleEntity(
    @PrimaryKey val id: String,
    val habitId: String,
    @ColumnInfo(defaultValue = "SELECTED_DAYS") val scheduleMode: String = "SELECTED_DAYS",
    val activeDays: String,
    val firstDayOfWeek: String,
    val effectiveFrom: String,
)
