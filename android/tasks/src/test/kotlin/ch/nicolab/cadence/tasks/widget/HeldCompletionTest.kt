package ch.nicolab.cadence.tasks.widget

import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

@OptIn(ExperimentalCoroutinesApi::class)
class HeldCompletionTest {
    private val completion = HeldCompletion(holdMillis = HOLD, graceMillis = GRACE)

    @Test
    fun `la coche est posée avant le redessin et avant l'écriture`() = runTest {
        val events = mutableListOf<String>()
        val outcome = completion.toggle(
            "a",
            redraw = { events += "redraw held=${completion.isHeld("a")}" },
            write = { events += "write held=${completion.isHeld(it)}" },
        )
        assertEquals(HeldCompletion.Outcome.WRITTEN, outcome)
        assertEquals(listOf("redraw held=true", "write held=true"), events)
        assertFalse(completion.isHeld("a"))
    }

    @Test
    fun `l'écriture attend la fin du maintien`() = runTest {
        var written = false
        val run = async { completion.toggle("a", write = { written = true }) }
        advanceTimeBy(HOLD - 1)
        runCurrent()
        assertFalse(written)
        assertTrue(completion.isHeld("a"))
        advanceTimeBy(2)
        runCurrent()
        assertTrue(written)
        run.await()
    }

    @Test
    fun `la coche reste le temps que la liste relise la base`() = runTest {
        val run = async { completion.toggle("a", write = {}) }
        advanceTimeBy(HOLD + GRACE - 1)
        runCurrent()
        assertTrue(completion.isHeld("a"))
        advanceTimeBy(2)
        runCurrent()
        assertFalse(completion.isHeld("a"))
        run.await()
    }

    @Test
    fun `toucher de nouveau pendant le maintien annule sans écrire`() = runTest {
        var writes = 0
        val first = async { completion.toggle("a", write = { writes++ }) }
        advanceTimeBy(HOLD / 2)
        runCurrent()
        val second = completion.toggle("a", write = { writes++ })
        assertEquals(HeldCompletion.Outcome.CANCELLED, second)
        assertFalse(completion.isHeld("a"))
        assertEquals(HeldCompletion.Outcome.CANCELLED, first.await())
        advanceTimeBy(HOLD * 2)
        assertEquals(0, writes)
    }

    @Test
    fun `un toucher pendant l'écriture est ignoré, la tâche n'est écrite qu'une fois`() = runTest {
        val gate = CompletableDeferred<Unit>()
        var writes = 0
        val first = async { completion.toggle("a", write = { writes++; gate.await() }) }
        advanceTimeBy(HOLD + 1)
        runCurrent()
        assertEquals(1, writes)
        assertEquals(HeldCompletion.Outcome.IGNORED, completion.toggle("a", write = { writes++ }))
        gate.complete(Unit)
        assertEquals(HeldCompletion.Outcome.WRITTEN, first.await())
        assertEquals(1, writes)
    }

    @Test
    fun `une écriture en échec rend la case et remonte l'erreur`() = runTest {
        assertThrows<IOException> {
            completion.toggle("a", write = { throw IOException("disk") })
        }
        assertFalse(completion.isHeld("a"))
        assertEquals(emptySet<String>(), completion.held.value)
    }

    @Test
    fun `deux tâches se cochent indépendamment`() = runTest {
        val a = async { completion.toggle("a", write = {}) }
        val b = async { completion.toggle("b", write = {}) }
        runCurrent()
        assertEquals(setOf("a", "b"), completion.held.value)
        assertEquals(HeldCompletion.Outcome.WRITTEN, a.await())
        assertEquals(HeldCompletion.Outcome.WRITTEN, b.await())
    }

    private companion object {
        const val HOLD = 700L
        const val GRACE = 1_000L
    }
}
