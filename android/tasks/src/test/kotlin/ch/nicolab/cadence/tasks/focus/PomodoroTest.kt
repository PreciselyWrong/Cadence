package ch.nicolab.cadence.tasks.focus

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PomodoroTest {
    private val minute = 60_000L

    @Test
    fun `a fresh session is an idle focus phase`() {
        val state = PomodoroState.idle()
        assertEquals(PomodoroPhase.FOCUS, state.phase)
        assertFalse(state.isRunning)
        assertEquals(25 * minute, state.remainingMs(0))
    }

    @Test
    fun `running time is derived from the clock`() {
        val state = PomodoroState.idle().start(1_000)
        assertEquals(20 * minute, state.remainingMs(1_000 + 5 * minute))
        assertTrue(state.isRunning)
    }

    @Test
    fun `pause freezes the counter and resume continues`() {
        val paused = PomodoroState.idle().start(0).pause(10 * minute)
        assertEquals(15 * minute, paused.remainingMs(99 * minute))
        val resumed = paused.start(20 * minute)
        assertEquals(10 * minute, resumed.remainingMs(25 * minute))
    }

    @Test
    fun `finished focus moves to a short break and counts the cycle`() {
        val state = PomodoroState.idle().start(0)
        assertTrue(state.isFinished(25 * minute))
        val next = state.advance()
        assertEquals(PomodoroPhase.SHORT_BREAK, next.phase)
        assertEquals(1, next.completedFocus)
        assertFalse(next.isRunning)
        assertEquals(5 * minute, next.remainingMs(0))
    }

    @Test
    fun `every fourth focus earns a long break`() {
        var state = PomodoroState.idle()
        repeat(3) { state = state.advance().advance() }
        val afterFourth = state.advance()
        assertEquals(PomodoroPhase.LONG_BREAK, afterFourth.phase)
        assertEquals(15 * minute, afterFourth.remainingMs(0))
        assertEquals(PomodoroPhase.FOCUS, afterFourth.advance().phase)
    }

    @Test
    fun `a break does not count as focus`() {
        val afterBreak = PomodoroState.idle().advance().advance()
        assertEquals(1, afterBreak.completedFocus)
    }

    @Test
    fun `remaining never goes below zero`() {
        assertEquals(0, PomodoroState.idle().start(0).remainingMs(999 * minute))
    }

    @Test
    fun `reset returns to a fresh focus phase but keeps the task`() {
        val reset = PomodoroState.idle().copy(taskUid = "abc").start(0).advance().reset()
        assertEquals(PomodoroState.idle().copy(taskUid = "abc"), reset)
    }

    @Test
    fun `encoding round trips`() {
        val state = PomodoroState.idle().start(5).pause(900).advance().copy(taskUid = "abc")
        assertEquals(state, PomodoroState.decode(state.encode()))
        assertEquals(PomodoroState.idle(), PomodoroState.decode("garbage"))
    }
}
