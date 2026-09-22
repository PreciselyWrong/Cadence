package ch.nicolab.cadence.health

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import ch.nicolab.cadence.domain.HealthConnectSession
import java.time.Instant
import java.time.ZoneId

enum class HealthConnectAvailability {
    AVAILABLE,
    UPDATE_REQUIRED,
    UNAVAILABLE,
}

class HealthConnectPermissionMissing : IllegalStateException()

/** Frontière unique autour du SDK AndroidX; Cadence ne lit que les séances d'exercice. */
class HealthConnectGateway(private val context: Context) {
    companion object {
        val permissions: Set<String> = setOf(
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        )
    }

    private val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    fun availability(): HealthConnectAvailability = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> HealthConnectAvailability.AVAILABLE
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthConnectAvailability.UPDATE_REQUIRED
        else -> HealthConnectAvailability.UNAVAILABLE
    }

    suspend fun hasPermission(): Boolean =
        availability() == HealthConnectAvailability.AVAILABLE &&
            client.permissionController.getGrantedPermissions().containsAll(permissions)

    suspend fun readSessions(
        fromInclusive: Instant,
        toExclusive: Instant,
        fallbackZone: ZoneId,
    ): List<HealthConnectSession> {
        if (!hasPermission()) throw HealthConnectPermissionMissing()
        val sessions = mutableListOf<HealthConnectSession>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = ExerciseSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(fromInclusive, toExclusive),
                    ascendingOrder = true,
                    pageSize = 1_000,
                    pageToken = pageToken,
                ),
            )
            response.records.forEach { record ->
                val packageName = record.metadata.dataOrigin.packageName
                if (record.metadata.id.isNotBlank() && packageName.isNotBlank()) {
                    sessions += HealthConnectSession(
                        recordId = record.metadata.id,
                        exerciseType = record.exerciseType,
                        dataOriginPackage = packageName,
                        startTime = record.startTime,
                        endTime = record.endTime,
                        observedZoneId = record.startZoneOffset ?: fallbackZone,
                    )
                }
            }
            pageToken = response.pageToken
        } while (pageToken != null)
        return sessions
    }

    @Suppress("DEPRECATION")
    fun applicationLabel(packageName: String): String? = runCatching {
        val info = context.packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
        context.packageManager.getApplicationLabel(info).toString().takeIf(String::isNotBlank)
    }.getOrNull()

    fun manageAccessIntent(): Intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
}
