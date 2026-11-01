package ch.nicolab.cadence.tasks.sync

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Les habitudes d'un compte A ne partent jamais vers un compte B connecté ensuite. */
class HabitOwnershipTest {
    private class FakeOwnerStore : HabitOwnerStore {
        override val state = MutableStateFlow(HabitOwnerState())
        override suspend fun update(change: (HabitOwnerState) -> HabitOwnerState) {
            state.value = change(state.value)
        }
    }

    private class FakeLocalHabits(var rows: Boolean) : LocalHabits {
        var outboxCleared = 0
        var deleted = 0
        override suspend fun hasRows() = rows
        override suspend fun clearOutbox() { outboxCleared++ }
        override suspend fun deleteAll() { deleted++; rows = false }
    }

    private val store = FakeOwnerStore()
    private val habits = FakeLocalHabits(rows = true)
    private val ownership = HabitOwnership(store, habits)

    private val accountA = HabitOwnership.accountId("https://cadence.test", "uid-a", "a@test")
    private val accountB = HabitOwnership.accountId("https://cadence.test", "uid-b", "b@test")

    @Test
    fun `le premier compte adopte les habitudes du telephone`() = runTest {
        assertEquals(HabitOwnership.Outcome.OWNED, ownership.onConnect(accountA))
        assertTrue(ownership.syncAllowed())
        assertFalse(ownership.observeForeign().first())
    }

    @Test
    fun `se reconnecter au meme compte garde la synchro`() = runTest {
        ownership.onConnect(accountA)
        ownership.onDisconnect()

        assertEquals(HabitOwnership.Outcome.OWNED, ownership.onConnect(accountA))
        assertTrue(ownership.syncAllowed())
        assertEquals(0, habits.outboxCleared)
    }

    @Test
    fun `un autre compte ne recoit pas les habitudes, file videe, synchro bloquee, question posee`() = runTest {
        ownership.onConnect(accountA)
        ownership.onDisconnect()

        assertEquals(HabitOwnership.Outcome.FOREIGN, ownership.onConnect(accountB))
        assertFalse(ownership.syncAllowed())
        assertEquals(1, habits.outboxCleared)
        assertTrue(ownership.observeForeign().first())
    }

    @Test
    fun `les garder sur le telephone ferme la question sans rouvrir la synchro`() = runTest {
        ownership.onConnect(accountA)
        ownership.onDisconnect()
        ownership.onConnect(accountB)

        ownership.keepLocal()

        assertFalse(ownership.observeForeign().first())
        assertFalse(ownership.syncAllowed())
        assertEquals(0, habits.deleted)
    }

    @Test
    fun `les supprimer rend les habitudes au nouveau compte`() = runTest {
        ownership.onConnect(accountA)
        ownership.onDisconnect()
        ownership.onConnect(accountB)

        ownership.deleteLocal()

        assertEquals(1, habits.deleted)
        assertTrue(ownership.syncAllowed())
        assertFalse(ownership.observeForeign().first())
    }

    @Test
    fun `revenir au compte d'origine rouvre la synchro de ses habitudes`() = runTest {
        ownership.onConnect(accountA)
        ownership.onDisconnect()
        ownership.onConnect(accountB)
        ownership.keepLocal()
        ownership.onDisconnect()

        assertEquals(HabitOwnership.Outcome.OWNED, ownership.onConnect(accountA))
        assertTrue(ownership.syncAllowed())
    }

    @Test
    fun `un telephone sans habitude adopte le nouveau compte`() = runTest {
        ownership.onConnect(accountA)
        ownership.onDisconnect()
        habits.rows = false

        assertEquals(HabitOwnership.Outcome.OWNED, ownership.onConnect(accountB))
        assertTrue(ownership.syncAllowed())
    }

    @Test
    fun `une installation deja connectee adopte son compte au premier passage`() = runTest {
        ownership.adoptIfUnknown(accountA)

        assertTrue(ownership.syncAllowed())
        assertEquals(HabitOwnership.Outcome.FOREIGN, ownership.run { onDisconnect(); onConnect(accountB) })
    }

    @Test
    fun `l'identite tient au serveur et a l'utilisateur, l'adresse a defaut`() {
        assertEquals("https://s|u1", HabitOwnership.accountId("https://s", "u1", "a@test"))
        assertEquals("https://s|a@test", HabitOwnership.accountId("https://s", null, "a@test"))
        assertEquals("https://s|", HabitOwnership.accountId("https://s", null, null))
    }
}
