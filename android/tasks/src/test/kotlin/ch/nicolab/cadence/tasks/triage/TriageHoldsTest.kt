package ch.nicolab.cadence.tasks.triage

import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TriageHoldsTest {
    private val call = DeferredCall(key = "c1", method = "POST", path = "/x", body = null, label = "l")
    private val sent = mutableListOf<String>()

    private fun TestScope.holds() = TriageHolds(backgroundScope, WINDOW) { sent += it.key }

    @Test
    fun theCallLeavesOnlyAfterTheWindowAndTheCardStaysHidden() = runTest {
        val holds = holds()
        holds.hold("a", call)
        assertEquals(setOf("a"), holds.hidden.value)

        advanceTimeBy(WINDOW - 1)
        runCurrent()
        assertTrue(sent.isEmpty())

        advanceTimeBy(1)
        runCurrent()
        assertEquals(listOf("c1"), sent)
        assertEquals(setOf("a"), holds.hidden.value)
    }

    @Test
    fun undoKeepsTheCallAndBringsTheCardBack() = runTest {
        val holds = holds()
        val undo = holds.hold("a", call)

        undo()
        advanceTimeBy(WINDOW * 2)
        runCurrent()

        assertTrue(sent.isEmpty())
        assertTrue(holds.hidden.value.isEmpty())
    }

    @Test
    fun leavingHandsOverTheHeldCallsOnce() = runTest {
        val holds = holds()
        holds.hold("a", call)

        assertEquals(listOf(call), holds.takeHeld())
        advanceTimeBy(WINDOW * 2)
        runCurrent()

        assertTrue(sent.isEmpty(), "la fenêtre ne l'envoie pas une seconde fois")
    }

    @Test
    fun aCardComesBackOnceItsCallIsNoLongerPending() = runTest {
        val holds = holds()
        holds.hold("a", call)
        advanceTimeBy(WINDOW)
        runCurrent()

        holds.settle(setOf("c1"))
        assertEquals(setOf("a"), holds.hidden.value)

        holds.settle(emptySet())
        assertTrue(holds.hidden.value.isEmpty())
    }

    @Test
    fun settlingLeavesAnOpenWindowAlone() = runTest {
        val holds = holds()
        holds.hold("a", call)

        holds.settle(emptySet())

        assertEquals(setOf("a"), holds.hidden.value)
    }

    private companion object {
        const val WINDOW = 4_500L
    }
}
