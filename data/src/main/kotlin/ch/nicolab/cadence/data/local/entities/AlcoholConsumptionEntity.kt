package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ColumnInfo
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "alcohol_consumptions",
    foreignKeys = [
        ForeignKey(
            entity = HabitEntity::class,
            parentColumns = ["id"],
            childColumns = ["habitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["habitId", "localDate"], unique = true),
    ],
)
data class AlcoholConsumptionEntity(
    @PrimaryKey val id: String,
    val habitId: String,
    val localDate: String,
    val observedZoneId: String,
    val standardDrinks: Int? = null,
    val followUpDate: String? = null,
    @ColumnInfo(defaultValue = "0") val followUpNotified: Boolean = false,
)
