package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "widget_habits",
    primaryKeys = ["appWidgetId", "habitId"],
    foreignKeys = [
        ForeignKey(
            entity = WidgetConfigurationEntity::class,
            parentColumns = ["appWidgetId"],
            childColumns = ["appWidgetId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = HabitEntity::class,
            parentColumns = ["id"],
            childColumns = ["habitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index("appWidgetId"),
        Index("habitId"),
    ],
)
data class WidgetHabitEntity(
    val appWidgetId: Int,
    val habitId: String,
)
