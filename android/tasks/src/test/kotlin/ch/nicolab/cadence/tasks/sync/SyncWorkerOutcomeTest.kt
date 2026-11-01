package ch.nicolab.cadence.tasks.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SyncWorkerOutcomeTest {
    private val missed = listOf(SyncResult.Offline("Serveur injoignable"), SyncResult.Failed("Erreur du serveur (HTTP 500)"))

    @Test
    fun `un passage immédiat manqué ne réessaie pas lui-même mais confie le nouvel essai à la chaîne à part`() {
        missed.forEach { assertEquals(WorkerOutcome.SCHEDULE_RETRY, workerOutcome(it, PassKind.NOW)) }
    }

    @Test
    fun `le passage périodique et la chaîne de nouvel essai reculent eux-mêmes`() {
        missed.forEach { result ->
            assertEquals(WorkerOutcome.RETRY, workerOutcome(result, PassKind.PERIODIC))
            assertEquals(WorkerOutcome.RETRY, workerOutcome(result, PassKind.RETRY))
        }
    }

    @Test
    fun `un passage réussi, refusé ou fermé se termine`() {
        listOf(SyncResult.Synced, SyncResult.Unauthorized, SyncResult.Closed).forEach { result ->
            PassKind.entries.forEach { kind -> assertEquals(WorkerOutcome.DONE, workerOutcome(result, kind)) }
        }
    }

    @Test
    fun `seul le retour du réseau demande un passage`() {
        assertEquals(true, syncOnConnectivityChange(wasOnline = false, isOnline = true))
        assertEquals(false, syncOnConnectivityChange(wasOnline = true, isOnline = true))
        assertEquals(false, syncOnConnectivityChange(wasOnline = true, isOnline = false))
        assertEquals(false, syncOnConnectivityChange(wasOnline = false, isOnline = false))
    }

    @Test
    fun `le retour au premier plan demande un passage, au plus un par intervalle`() {
        var now = 0L
        val gate = ForegroundGate(minIntervalMs = 30_000, nowMs = { now })

        assertEquals(true, gate.onStart())
        assertEquals(false, gate.onStart()) // une deuxième activité, l'app est déjà au premier plan
        gate.onStop()
        gate.onStop()
        now = 10_000
        assertEquals(false, gate.onStart()) // revenue trop tôt
        gate.onStop()
        now = 45_000
        assertEquals(true, gate.onStart())
    }
}
