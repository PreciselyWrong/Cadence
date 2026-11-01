package ch.nicolab.cadence.tasks.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PendingHabitWritesTest {
    @Test
    fun `les ecritures d'habitudes comptent quand la synchro est permise`() {
        assertEquals(3, pendingHabitWrites(3, foreign = false))
    }

    @Test
    fun `un autre compte ne compte pas ses ecritures d'habitudes, qui ne partiront jamais`() {
        assertEquals(0, pendingHabitWrites(3, foreign = true))
    }
}
