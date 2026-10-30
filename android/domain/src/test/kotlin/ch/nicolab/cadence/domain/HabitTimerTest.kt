package ch.nicolab.cadence.domain

import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitTimerTest {

    private val t0 = Instant.parse("2026-06-01T09:00:00Z")
    private fun at(seconds: Long) = t0.plusSeconds(seconds)

    @Test
    fun `a started timer runs from zero`() {
        val timer = HabitTimer.started("habit-1", t0)

        assertTrue(timer.isRunning)
        assertEquals(0, timer.elapsedSecondsAt(t0))
        assertEquals(90, timer.elapsedSecondsAt(at(90)))
    }

    @Test
    fun `a pause freezes the elapsed time`() {
        val paused = HabitTimer.started("habit-1", t0).pausedAt(at(60))

        assertFalse(paused.isRunning)
        assertEquals(60, paused.elapsedSecondsAt(at(60)))
        // Une pause ne crée pas de temps compté, même très longue.
        assertEquals(60, paused.elapsedSecondsAt(at(6_000)))
    }

    @Test
    fun `resuming counts again from the moment of the resume`() {
        val timer = HabitTimer.started("habit-1", t0)
            .pausedAt(at(60))
            .resumedAt(at(600))

        assertTrue(timer.isRunning)
        assertEquals(60, timer.elapsedSecondsAt(at(600)))
        assertEquals(90, timer.elapsedSecondsAt(at(630)))
    }

    @Test
    fun `several segments add up`() {
        val timer = HabitTimer.started("habit-1", t0)
            .pausedAt(at(30))
            .resumedAt(at(100))
            .pausedAt(at(130))
            .resumedAt(at(200))

        assertEquals(60, timer.elapsedSecondsAt(at(200)))
        assertEquals(70, timer.elapsedSecondsAt(at(210)))
    }

    @Test
    fun `a double press changes nothing`() {
        val running = HabitTimer.started("habit-1", t0)
        assertEquals(running, running.resumedAt(at(10)))

        val paused = running.pausedAt(at(60))
        assertEquals(paused, paused.pausedAt(at(120)))
        assertEquals(60, paused.pausedAt(at(120)).elapsedSecondsAt(at(300)))
    }

    @Test
    fun `a reset returns to a stopped timer at zero`() {
        val reset = HabitTimer.started("habit-1", t0).pausedAt(at(120)).reset()

        assertFalse(reset.isRunning)
        assertEquals(0, reset.elapsedSecondsAt(at(500)))
    }

    @Test
    fun `a clock going backwards never removes counted time`() {
        val timer = HabitTimer.started("habit-1", t0)

        assertEquals(0, timer.elapsedSecondsAt(t0.minusSeconds(30)))
    }

    @Test
    fun `finishing yields the elapsed seconds and nothing else`() {
        val timer = HabitTimer.started("habit-1", t0).pausedAt(at(45)).resumedAt(at(100))

        assertEquals(75, timer.elapsedSecondsAt(at(130)))
    }

    @Test
    fun `an accumulated timer cannot be built with negative time`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitTimer("habit-1", accumulatedSeconds = -1, runningSince = null)
        }
        assertThrows(IllegalArgumentException::class.java) {
            HabitTimer(" ", accumulatedSeconds = 0, runningSince = null)
        }
    }

    @Test
    fun `a paused timer keeps no running mark`() {
        assertNull(HabitTimer.started("habit-1", t0).pausedAt(at(10)).runningSince)
    }

    @Test
    fun `the attainment follows the elapsed time while running`() {
        val goal = HabitGoal(
            targetMinor = 1_800,
            minimumMinor = 600,
            period = PeriodType.DAY,
            goalType = GoalType.DURATION,
            unit = MeasurementUnit.MINUTES,
        )

        assertEquals(GoalAttainment.TODO, HabitTimer.attainmentOf(goal, progressMinor = 0, elapsedSeconds = 0))
        assertEquals(GoalAttainment.TODO, HabitTimer.attainmentOf(goal, progressMinor = 0, elapsedSeconds = 599))
        assertEquals(GoalAttainment.MINIMUM, HabitTimer.attainmentOf(goal, progressMinor = 0, elapsedSeconds = 600))
        assertEquals(GoalAttainment.IDEAL, HabitTimer.attainmentOf(goal, progressMinor = 0, elapsedSeconds = 1_800))
        // Le temps déjà enregistré dans la période compte avec celui du chronomètre.
        assertEquals(GoalAttainment.IDEAL, HabitTimer.attainmentOf(goal, progressMinor = 1_500, elapsedSeconds = 300))
    }
}
