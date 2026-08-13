package ch.nicolab.cadence.data.local

import kotlinx.serialization.Serializable

@Serializable
data class BackupDocument(
    val formatVersion: Int = 2,
    val exportedAtEpochMs: Long,
    val habits: List<BackupHabitV2> = emptyList(),
    val entries: List<BackupEntryV2> = emptyList(),
    val quickValues: List<BackupQuickValueV2> = emptyList(),
    val reminders: List<BackupReminderV2> = emptyList(),
    val pauses: List<BackupPauseV2> = emptyList(),
    val widgetConfigs: List<BackupWidgetConfigV2> = emptyList(),
)

@Serializable
data class BackupHabitV2(
    val id: String,
    val name: String,
    val description: String? = null,
    val iconId: String? = null,
    val colorArgb: Int? = null,
    val active: Boolean,
    val startsOn: String,
    val archived: Boolean,
    val sortOrder: Int,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long,
    val goals: List<BackupGoalV2>,
    val schedules: List<BackupScheduleV2>,
)

@Serializable
data class BackupGoalV2(
    val id: String,
    val habitId: String,
    val targetMinor: Long,
    val period: String,
    val goalType: String = "QUANTITY",
    val unit: BackupUnitV2? = null,
    val frequencyTarget: Int? = null,
    val effectiveFrom: String,
)

@Serializable
data class BackupUnitV2(
    val id: String,
    val dimension: String,
    val nameFr: String,
    val symbol: String,
    val scaleToCanonical: Long = 1L,
)

@Serializable
data class BackupScheduleV2(
    val id: String,
    val habitId: String,
    val scheduleMode: String = "SELECTED_DAYS",
    val activeDays: List<String>,
    val firstDayOfWeek: String,
    val effectiveFrom: String,
    val intervalDays: Int = 2,
)

@Serializable
data class BackupEntryV2(
    val id: String,
    val habitId: String,
    val occurredAtEpochMs: Long,
    val localDate: String,
    val observedZoneId: String,
    val valueMinor: Long,
    val source: String,
    val sessionId: String? = null,
    val note: String? = null,
)

@Serializable
data class BackupQuickValueV2(
    val id: String,
    val habitId: String,
    val label: String,
    val amountMinor: Long,
    val sortOrder: Int,
)

@Serializable
data class BackupReminderV2(
    val id: String,
    val habitId: String,
    val time: String,
    val daysOfWeek: List<String>,
    val enabled: Boolean,
    val conditional: Boolean = true,
)

@Serializable
data class BackupPauseV2(
    val id: String,
    val habitId: String,
    val start: String,
    val endExclusive: String?,
    val reason: String?,
)

@Serializable
data class BackupWidgetConfigV2(
    val appWidgetId: Int,
    val title: String?,
    val theme: String,
    val selectedHabitIds: List<String>,
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
)

@Serializable
data class BackupDocumentV1(
    val formatVersion: Int = 1,
    val exportedAtEpochMs: Long,
    val habits: List<BackupHabitV1>,
    val entries: List<BackupEntryV1>,
    val quickValues: List<BackupQuickValueV1>,
    val pauses: List<BackupPauseV1>,
)

@Serializable
data class BackupHabitV1(
    val id: String,
    val name: String,
    val active: Boolean,
    val targetMinor: Long,
    val period: String,
    val activeDays: List<String>,
    val firstDayOfWeek: String,
)

@Serializable data class BackupEntryV1(val id: String, val habitId: String, val occurredAtEpochMs: Long, val localDate: String, val observedZoneId: String, val valueMinor: Long, val source: String)
@Serializable data class BackupQuickValueV1(val id: String, val habitId: String, val label: String, val amountMinor: Long, val sortOrder: Int)
@Serializable data class BackupPauseV1(val id: String, val habitId: String, val start: String, val endExclusive: String?, val reason: String?)
