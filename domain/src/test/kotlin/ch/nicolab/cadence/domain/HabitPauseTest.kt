package ch.nicolab.cadence.domain

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitPauseTest {

    private val monday = LocalDate.of(2026, 5, 4)

    @Test
    fun `a skip covers a single day and carries its reason`() {
        val skip = HabitPause.skip(monday, PauseReason.ILLNESS)

        assertTrue(skip.includes(monday))
        assertFalse(skip.includes(monday.plusDays(1)))
        assertTrue(skip.isSingleDay)
        assertEquals(PauseReason.ILLNESS, skip.reason)
    }

    @Test
    fun `a custom reason keeps its wording`() {
        val skip = HabitPause.skip(monday, PauseReason.CUSTOM, "Déménagement")

        assertEquals(PauseReason.CUSTOM, skip.reason)
        assertEquals("Déménagement", skip.reasonLabel)
    }

    @Test
    fun `a custom reason without wording is refused`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitPause.skip(monday, PauseReason.CUSTOM, "  ")
        }
    }

    @Test
    fun `a wording is ignored outside of a custom reason`() {
        assertNull(HabitPause.skip(monday, PauseReason.REST, "Repos").reasonLabel)
    }

    @Test
    fun `a skip is cancellable on its own day only`() {
        val skip = HabitPause.skip(monday, PauseReason.REST)

        assertTrue(skip.isCancellableOn(monday))
        assertFalse(skip.isCancellableOn(monday.plusDays(1)))
        assertFalse(skip.isCancellableOn(monday.minusDays(1)))
    }

    @Test
    fun `a travel covers an inclusive range of days`() {
        val travel = HabitPause.travel(monday, monday.plusDays(3))

        assertTrue(travel.includes(monday))
        assertTrue(travel.includes(monday.plusDays(3)))
        assertFalse(travel.includes(monday.plusDays(4)))
        assertFalse(travel.isSingleDay)
        assertEquals(PauseReason.TRAVEL, travel.reason)
    }

    @Test
    fun `a travel of one day is allowed`() {
        val travel = HabitPause.travel(monday, monday)

        assertTrue(travel.includes(monday))
        assertTrue(travel.isSingleDay)
    }

    @Test
    fun `a travel ending before it starts is refused`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitPause.travel(monday, monday.minusDays(1))
        }
    }

    @Test
    fun `an early resume closes the pause on the chosen day`() {
        val travel = HabitPause.travel(monday, monday.plusDays(6))

        val shortened = travel.resumedOn(monday.plusDays(2))

        assertEquals(monday.plusDays(2), shortened?.endExclusive)
        assertTrue(shortened!!.includes(monday.plusDays(1)))
        assertFalse(shortened.includes(monday.plusDays(2)))
    }

    @Test
    fun `resuming on or before the first day removes the pause`() {
        val travel = HabitPause.travel(monday, monday.plusDays(6))

        assertNull(travel.resumedOn(monday))
        assertNull(travel.resumedOn(monday.minusDays(1)))
    }

    @Test
    fun `resuming after the end leaves the pause untouched`() {
        val travel = HabitPause.travel(monday, monday.plusDays(2))

        assertEquals(travel, travel.resumedOn(monday.plusDays(5)))
    }

    @Test
    fun `an open pause has no end and can still be resumed`() {
        val open = HabitPause(monday, null, PauseReason.MANUAL)

        assertTrue(open.includes(monday.plusYears(1)))
        assertEquals(monday.plusDays(2), open.resumedOn(monday.plusDays(2))?.endExclusive)
    }

    @Test
    fun `a paused day never validates the habit nor counts as a failure`() {
        val habit = HabitDefinition(
            id = "habit-1",
            goal = HabitGoal(targetMinor = 1, period = PeriodType.DAY, goalType = GoalType.BINARY),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )

        val result = HabitEvaluator().evaluate(
            habit = habit,
            date = monday,
            entries = emptyList(),
            pauses = listOf(HabitPause.skip(monday, PauseReason.REST)),
        )

        assertFalse(result.isCompleted)
        assertFalse(result.countsAsFailure)
        assertFalse(result.needsAttentionNow)
        assertTrue(result.isPaused)
    }
}
