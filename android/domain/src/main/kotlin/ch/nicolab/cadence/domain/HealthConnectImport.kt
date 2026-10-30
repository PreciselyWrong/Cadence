package ch.nicolab.cadence.domain

import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/** Règle locale qui relie une habitude de durée à des séances Health Connect. */
data class HealthConnectRule(
    val habitId: String,
    val exerciseTypes: Set<Int>,
    val dataOriginPackage: String? = null,
    val enabled: Boolean = true,
) {
    init {
        require(habitId.isNotBlank()) { "Habit id cannot be blank" }
        require(exerciseTypes.isNotEmpty()) { "At least one exercise type is required" }
        require(dataOriginPackage == null || dataOriginPackage.isNotBlank()) { "Data origin cannot be blank" }
    }
}

/** Séance minimale lue depuis Health Connect, sans dépendance Android dans le domaine. */
data class HealthConnectSession(
    val recordId: String,
    val exerciseType: Int,
    val dataOriginPackage: String,
    val startTime: Instant,
    val endTime: Instant,
    val observedZoneId: ZoneId,
) {
    init {
        require(recordId.isNotBlank()) { "Record id cannot be blank" }
        require(dataOriginPackage.isNotBlank()) { "Data origin cannot be blank" }
    }
}

enum class HealthConnectImportState {
    IMPORTED,
    IGNORED,
    DETACHED,
}

data class HealthConnectImportKey(
    val recordId: String,
    val habitId: String,
    val state: HealthConnectImportState,
)

data class PlannedHealthConnectEntry(
    val recordId: String,
    val habitId: String,
    val entryId: String,
    val dataOriginPackage: String,
    val occurredAt: Instant,
    val localDate: LocalDate,
    val observedZoneId: ZoneId,
    val valueSeconds: Long,
)

/** Produit seulement les nouvelles saisies; tout état déjà connu constitue un tombstone. */
object HealthConnectImportPlanner {
    fun plan(
        rules: List<HealthConnectRule>,
        sessions: List<HealthConnectSession>,
        knownImports: Set<HealthConnectImportKey>,
    ): List<PlannedHealthConnectEntry> {
        val known = knownImports.mapTo(mutableSetOf()) { it.recordId to it.habitId }
        val planned = mutableListOf<PlannedHealthConnectEntry>()

        sessions.forEach { session ->
            val seconds = Duration.between(session.startTime, session.endTime).seconds
            if (seconds <= 0L) return@forEach

            rules.asSequence()
                .filter(HealthConnectRule::enabled)
                .filter { session.exerciseType in it.exerciseTypes }
                .filter { it.dataOriginPackage == null || it.dataOriginPackage == session.dataOriginPackage }
                .forEach { rule ->
                    val key = session.recordId to rule.habitId
                    if (!known.add(key)) return@forEach
                    planned += PlannedHealthConnectEntry(
                        recordId = session.recordId,
                        habitId = rule.habitId,
                        entryId = entryId(rule.habitId, session.recordId),
                        dataOriginPackage = session.dataOriginPackage,
                        occurredAt = session.startTime,
                        localDate = session.startTime.atZone(session.observedZoneId).toLocalDate(),
                        observedZoneId = session.observedZoneId,
                        valueSeconds = seconds,
                    )
                }
        }
        return planned
    }

    fun entryId(habitId: String, recordId: String): String = "hc-${UUID.nameUUIDFromBytes(
        "health-connect|$habitId|$recordId".toByteArray(StandardCharsets.UTF_8),
    )}"
}
