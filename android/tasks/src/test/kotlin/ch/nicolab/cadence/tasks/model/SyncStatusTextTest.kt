package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SyncStatusTextTest {
    private val now = Instant.parse("2026-11-01T12:00:00Z")
    private val zone = ZoneId.of("Europe/Zurich")

    @Test
    fun `synchronisé, hors ligne et erreur se disent en une ligne`() {
        assertEquals("Synchronisé · il y a 2 min", SyncStatusText.line(SyncStatus.Idle(now.minusSeconds(120), 0), now, zone))
        assertEquals("Hors ligne · 3 modifications en attente", SyncStatusText.line(SyncStatus.Offline(null, 3), now, zone))
        assertEquals("Hors ligne", SyncStatusText.line(SyncStatus.Offline(now, 0), now, zone))
        assertEquals(
            "Erreur : Erreur du serveur (HTTP 500) · 1 modification en attente",
            SyncStatusText.line(SyncStatus.Failed("Erreur du serveur (HTTP 500)", 1), now, zone),
        )
        assertEquals("Pas encore synchronisé", SyncStatusText.line(SyncStatus.Idle(null, 0), now, zone))
        assertEquals("Synchronisé · à l'instant · 2 modifications en attente", SyncStatusText.line(SyncStatus.Idle(now, 2), now, zone))
    }

    @Test
    fun `le temps écoulé reste lisible`() {
        assertEquals("il y a 3 h", SyncStatusText.ago(now.minusSeconds(3 * 3600 + 10), now, zone))
        assertEquals("le 30 oct. à 09:15", SyncStatusText.ago(Instant.parse("2026-10-30T08:15:00Z"), now, zone))
    }
}
