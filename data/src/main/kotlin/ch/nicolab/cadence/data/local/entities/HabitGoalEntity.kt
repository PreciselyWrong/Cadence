package ch.nicolab.cadence.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "habit_goals",
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
data class HabitGoalEntity(
    @PrimaryKey val id: String,
    val habitId: String,
    val targetMinor: Long,
    val period: String,
    @ColumnInfo(defaultValue = "QUANTITY") val goalType: String = "QUANTITY",
    val unitId: String? = null,
    val unitDimension: String? = null,
    val unitNameFr: String? = null,
    val unitSymbol: String? = null,
    val unitScaleToCanonical: Long? = null,
    val frequencyTarget: Int? = null,
    val effectiveFrom: String,
)
