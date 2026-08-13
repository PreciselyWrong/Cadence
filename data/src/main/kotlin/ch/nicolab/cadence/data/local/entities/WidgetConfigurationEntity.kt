package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "widget_configurations")
data class WidgetConfigurationEntity(
    @PrimaryKey val appWidgetId: Int,
    val title: String?,
    val theme: String,
)
