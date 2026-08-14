package ch.nicolab.cadence.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "widget_configurations")
data class WidgetConfigurationEntity(
    @PrimaryKey val appWidgetId: Int,
    val title: String?,
    val theme: String,
    val selectAll: Boolean = true,
    val opacity: Int = 100,
    val showValues: Boolean = true,
    val iconSizeDp: Int = 32,
    val progressStyle: String = "RING",
    val showDoneIndicator: Boolean = true,
    val maxHabitsPerRow: Int = 4,
    val showLabels: Boolean = false,
    val labelTextSizeSp: Int = 11,
    val labelOpacity: Int = 100,
    val valueTextSizeSp: Int = 11,
    val valueOpacity: Int = 100,
    val iconOpacity: Int = 100,
    val iconSaturation: Int = 100,
    val monochromeIcons: Boolean = false,
    /** `ALL`, `AUTOMATIC` ou `SINGLE` — voir `WidgetGroupMode`. */
    @ColumnInfo(defaultValue = "ALL") val groupMode: String = "ALL",
    /** Groupe retenu lorsque le mode est `SINGLE`. */
    val groupId: String? = null,
    /** `FLEXIBLE` ou `FIXED` — voir `WidgetSlotMode`. */
    @ColumnInfo(defaultValue = "FLEXIBLE") val slotMode: String = "FLEXIBLE",
    /** `START`, `CENTER` ou `END`, appliqué aux emplacements fixes. */
    @ColumnInfo(defaultValue = "CENTER") val slotAlignment: String = "CENTER",
)
