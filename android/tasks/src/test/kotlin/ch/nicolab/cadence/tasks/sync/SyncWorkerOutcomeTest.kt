package ch.nicolab.cadence.tasks.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SyncWorkerOutcomeTest {
    @Test
    fun `un passage immédiat hors ligne ne se replanifie pas, pour ne pas bloquer les demandes suivantes`() {
        assertEquals(WorkerOutcome.DONE, workerOutcome(SyncResult.Offline("timeout"), periodic = false))
    }

    @Test
    fun `le passage périodique hors ligne réessaie`() {
        assertEquals(WorkerOutcome.RETRY, workerOutcome(SyncResult.Offline("timeout"), periodic = true))
    }

    @Test
    fun `un passage réussi, refusé ou fermé se termine`() {
        listOf(SyncResult.Synced, SyncResult.Unauthorized, SyncResult.Closed).forEach { result ->
            assertEquals(WorkerOutcome.DONE, workerOutcome(result, periodic = false))
            assertEquals(WorkerOutcome.DONE, workerOutcome(result, periodic = true))
        }
    }
}
