package ch.nicolab.cadence.data.local

import kotlinx.serialization.Serializable

@Serializable
data class BackupDocument(
    val formatVersion: Int = 1,
    val exportedAtEpochMs: Long,
    val habits: List<BackupHabit>,
    val entries: List<BackupEntry>,
    val quickValues: List<BackupQuickValue>,
    val pauses: List<BackupPause>,
)

@Serializable data class BackupHabit(val id: String, val name: String, val active: Boolean, val targetMinor: Long, val period: String, val activeDays: List<String>, val firstDayOfWeek: String)
@Serializable data class BackupEntry(val id: String, val habitId: String, val occurredAtEpochMs: Long, val localDate: String, val observedZoneId: String, val valueMinor: Long, val source: String)
@Serializable data class BackupQuickValue(val id: String, val habitId: String, val label: String, val amountMinor: Long, val sortOrder: Int)
@Serializable data class BackupPause(val id: String, val habitId: String, val start: String, val endExclusive: String?, val reason: String?)
