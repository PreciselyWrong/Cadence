package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "health_connect_rules",
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
data class HealthConnectRuleEntity(
    @PrimaryKey val habitId: String,
    val exerciseTypes: String,
    val dataOriginPackage: String? = null,
    val enabled: Boolean = true,
)
