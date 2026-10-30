package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * L'augmentation se calcule à partir du départ, jamais en cumulant la cible courante :
 * relire une date deux fois doit donner deux fois le même chiffre.
 */
class GoalProgressionTest {

    private val start = LocalDate.of(2026, 1, 5) // lundi

    private fun weekly(step: Long = 5, cap: Long? = null) = GoalProgression(
        step = step,
        cadence = ProgressionCadence.WEEKLY,
        capMinor = cap,
        startsOn = start,
    )

    @Test
    fun `the first period keeps the starting target`() {
        assertEquals(20, weekly().targetAt(20, start))
        assertEquals(20, weekly().targetAt(20, start.plusDays(6)))
    }

    @Test
    fun `each week adds one step`() {
        val progression = weekly(step = 5)

        assertEquals(25, progression.targetAt(20, start.plusDays(7)))
        assertEquals(30, progression.targetAt(20, start.plusDays(14)))
        assertEquals(45, progression.targetAt(20, start.plusDays(35)))
    }

    @Test
    fun `a monthly cadence follows civil months, not thirty day blocks`() {
        val monthly = GoalProgression(2, ProgressionCadence.MONTHLY, null, LocalDate.of(2026, 1, 31))

        assertEquals(10, monthly.targetAt(10, LocalDate.of(2026, 1, 31)))
        // Février n'a pas de 31 : le palier suit le changement de mois, pas le quantième.
        assertEquals(12, monthly.targetAt(10, LocalDate.of(2026, 2, 1)))
        assertEquals(12, monthly.targetAt(10, LocalDate.of(2026, 2, 28)))
        assertEquals(14, monthly.targetAt(10, LocalDate.of(2026, 3, 1)))
        assertEquals(34, monthly.targetAt(10, LocalDate.of(2027, 1, 1)))
    }

    @Test
    fun `the cap stops the progression without ever exceeding it`() {
        val capped = weekly(step = 5, cap = 32)

        assertEquals(30, capped.targetAt(20, start.plusDays(14)))
        assertEquals(32, capped.targetAt(20, start.plusDays(21)))
        assertEquals(32, capped.targetAt(20, start.plusDays(700)))
    }

    @Test
    fun `a date before the start keeps the starting target`() {
        assertEquals(20, weekly().targetAt(20, start.minusDays(1)))
        assertEquals(20, weekly().targetAt(20, start.minusYears(3)))
    }

    @Test
    fun `a target below the cap already reached stays put`() {
        val capped = weekly(step = 5, cap = 20)

        assertEquals(20, capped.targetAt(20, start.plusDays(70)))
    }

    @Test
    fun `the next targets can be previewed`() {
        val preview = weekly(step = 5, cap = 35).preview(20, start, count = 5)

        assertEquals(listOf(20L, 25L, 30L, 35L, 35L), preview.map(ProgressionStep::targetMinor))
        assertEquals(start, preview.first().from)
        assertEquals(start.plusDays(7), preview[1].from)
    }

    @Test
    fun `a monthly preview walks civil months`() {
        val monthly = GoalProgression(3, ProgressionCadence.MONTHLY, null, LocalDate.of(2026, 1, 15))

        val preview = monthly.preview(10, LocalDate.of(2026, 1, 15), count = 3)

        assertEquals(listOf(LocalDate.of(2026, 1, 15), LocalDate.of(2026, 2, 15), LocalDate.of(2026, 3, 15)), preview.map(ProgressionStep::from))
        assertEquals(listOf(10L, 13L, 16L), preview.map(ProgressionStep::targetMinor))
    }

    @Test
    fun `a step must be positive and a cap must be reachable`() {
        assertThrows(IllegalArgumentException::class.java) {
            GoalProgression(0, ProgressionCadence.WEEKLY, null, start)
        }
        assertThrows(IllegalArgumentException::class.java) {
            GoalProgression(5, ProgressionCadence.WEEKLY, capMinor = 0, startsOn = start)
        }
    }

    @Test
    fun `a goal without progression never moves`() {
        val goal = HabitGoal(targetMinor = 20, period = PeriodType.DAY)

        assertEquals(20, goal.targetAt(start.plusYears(2)))
        assertTrue(goal.progression == null)
    }

    @Test
    fun `a goal carrying a progression exposes its target of the day`() {
        val goal = HabitGoal(
            targetMinor = 20,
            period = PeriodType.WEEK,
            progression = weekly(step = 5, cap = 30),
        )

        assertEquals(20, goal.targetAt(start))
        assertEquals(25, goal.targetAt(start.plusDays(7)))
        assertEquals(30, goal.targetAt(start.plusDays(21)))
    }

    @Test
    fun `stopping a progression freezes the target where it stood`() {
        val goal = HabitGoal(targetMinor = 20, period = PeriodType.WEEK, progression = weekly(step = 5))
        val reachedAt = start.plusDays(14)

        val stopped = goal.withoutProgression(reachedAt)

        assertEquals(30, stopped.targetMinor)
        assertTrue(stopped.progression == null)
        assertEquals(30, stopped.targetAt(start.plusDays(70)))
    }

    @Test
    fun `a limit can grow too, and stays a limit`() {
        val goal = HabitGoal(
            targetMinor = 10,
            period = PeriodType.DAY,
            goalType = GoalType.COUNT,
            direction = GoalDirection.AT_MOST,
            progression = weekly(step = 1, cap = 12),
        )

        assertEquals(12, goal.targetAt(start.plusDays(21)))
        assertTrue(goal.isLimit)
    }
}
