package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "abstinence_logs",
    foreignKeys = [ForeignKey(entity = HabitEntity::class, parentColumns = ["id"],
        childColumns = ["habitId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index(value = ["habitId", "localDate"])],
)
data class AbstinenceLogEntity(
    @PrimaryKey val id: String,
    val habitId: String,
    val occurredAtEpochMs: Long,
    val localDate: String,
    val observedZoneId: String,
    val kind: String,
    val intensity: Int?,
    val note: String?,
)
