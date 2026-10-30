package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "health_connect_imports",
    primaryKeys = ["recordId", "habitId"],
    foreignKeys = [
        ForeignKey(
            entity = HabitEntity::class,
            parentColumns = ["id"],
            childColumns = ["habitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("habitId"), Index(value = ["entryId"], unique = true)],
)
data class HealthConnectImportEntity(
    val recordId: String,
    val habitId: String,
    val entryId: String,
    val dataOriginPackage: String,
    val state: String,
)
