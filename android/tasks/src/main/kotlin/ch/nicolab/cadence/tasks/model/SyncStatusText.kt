package ch.nicolab.cadence.tasks.model

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Ligne d'état de la synchronisation, en clair : « Synchronisé · il y a 2 min », « Hors ligne · 3 modifications
 * en attente », « Erreur : … ». Sans Android, pour être testée sur la JVM.
 */
object SyncStatusText {
    private val DAY_TIME = DateTimeFormatter.ofPattern("d MMM 'à' HH:mm", Locale.FRENCH)

    fun line(status: SyncStatus, now: Instant, zone: ZoneId = ZoneId.systemDefault()): String = when (status) {
        SyncStatus.NotConnected -> "Non connecté au serveur Cadence"
        SyncStatus.Syncing -> "Synchronisation…"
        is SyncStatus.Idle -> join(
            status.lastSyncAt?.let { "Synchronisé · ${ago(it, now, zone)}" } ?: "Pas encore synchronisé",
            pending(status.pendingOps),
        )
        is SyncStatus.Offline -> join("Hors ligne", pending(status.pendingOps))
        is SyncStatus.Failed -> join("Erreur : ${status.message}", pending(status.pendingOps))
    }

    fun pending(count: Int): String? = when {
        count <= 0 -> null
        count == 1 -> "1 modification en attente"
        else -> "$count modifications en attente"
    }

    fun ago(at: Instant, now: Instant, zone: ZoneId = ZoneId.systemDefault()): String {
        val elapsed = Duration.between(at, now)
        return when {
            elapsed.toMinutes() < 1 -> "à l'instant"
            elapsed.toMinutes() < 60 -> "il y a ${elapsed.toMinutes()} min"
            elapsed.toHours() < 24 -> "il y a ${elapsed.toHours()} h"
            else -> "le ${DAY_TIME.format(at.atZone(zone))}"
        }
    }

    private fun join(vararg parts: String?): String = parts.filterNotNull().joinToString(" · ")
}
