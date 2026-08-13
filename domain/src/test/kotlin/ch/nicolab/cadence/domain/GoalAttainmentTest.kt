package ch.nicolab.cadence.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Le minimum valide la période et la série; l'idéal marque une réussite complète. */
class GoalAttainmentTest {

    private val evaluator = HabitEvaluator()
    private val date = LocalDate.of(2026, 4, 14)
    private val zone = ZoneId.of("Europe/Zurich")

    private fun habit(minimum: Long?, ideal: Long, frequency: Int? = null) = HabitDefinition(
        id = "habit-1",
        goal = HabitGoal(
            targetMinor = ideal,
            minimumMinor = minimum,
            period = PeriodType.DAY,
            goalType = GoalType.QUANTITY,
            frequencyTarget = frequency,
        ),
        schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
    )

    private fun entries(vararg values: Long) = values.mapIndexed { index, value ->
        HabitEntry(
            id = "entry-$index",
            habitId = "habit-1",
            occurredAt = Instant.parse("2026-04-14T08:00:00Z").plusSeconds(index.toLong()),
            localDate = date,
            observedZoneId = zone,
            valueMinor = value,
            sessionId = "session-$index",
        )
    }

    @Test
    fun `without progress nothing is reached`() {
        val result = evaluator.evaluate(habit(minimum = 3, ideal = 10), date, emptyList())

        assertEquals(GoalAttainment.TODO, result.attainment)
        assertFalse(result.reachedMinimum)
        assertFalse(result.isCompleted)
        assertTrue(result.countsAsFailure)
        assertTrue(result.needsAttentionNow)
    }

    @Test
    fun `the minimum validates the period without marking a complete success`() {
        val result = evaluator.evaluate(habit(minimum = 3, ideal = 10), date, entries(3))

        assertEquals(GoalAttainment.MINIMUM, result.attainment)
        assertTrue(result.reachedMinimum)
        assertTrue(result.validatesPeriod)
        assertFalse(result.isCompleted)
        assertFalse(result.countsAsFailure)
        // L'idéal reste à atteindre : l'habitude continue de demander une action.
        assertTrue(result.needsAttentionNow)
    }

    @Test
    fun `the ideal marks a complete success`() {
        val result = evaluator.evaluate(habit(minimum = 3, ideal = 10), date, entries(10))

        assertEquals(GoalAttainment.IDEAL, result.attainment)
        assertTrue(result.reachedMinimum)
        assertTrue(result.isCompleted)
        assertFalse(result.needsAttentionNow)
        assertFalse(result.countsAsFailure)
    }

    @Test
    fun `an absent minimum falls back to the ideal`() {
        val result = evaluator.evaluate(habit(minimum = null, ideal = 10), date, entries(9))

        assertFalse(result.reachedMinimum)
        assertEquals(GoalAttainment.TODO, result.attainment)
        assertTrue(result.countsAsFailure)
    }

    @Test
    fun `the frequency still gates the period even at the ideal quantity`() {
        val result = evaluator.evaluate(habit(minimum = 3, ideal = 10, frequency = 3), date, entries(10))

        assertTrue(result.completedQuantity)
        assertFalse(result.validatesPeriod)
        assertFalse(result.isCompleted)
        assertEquals(GoalAttainment.TODO, result.attainment)
        assertTrue(result.countsAsFailure)
    }

    @Test
    fun `frequency and minimum together validate the period`() {
        val result = evaluator.evaluate(habit(minimum = 3, ideal = 10, frequency = 3), date, entries(1, 1, 1))

        assertTrue(result.validatesPeriod)
        assertEquals(GoalAttainment.MINIMUM, result.attainment)
        assertFalse(result.countsAsFailure)
    }

    @Test
    fun `a minimum above the ideal is refused`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitGoal(targetMinor = 5, minimumMinor = 6, period = PeriodType.DAY)
        }
        assertThrows(IllegalArgumentException::class.java) {
            HabitGoal(targetMinor = 5, minimumMinor = 0, period = PeriodType.DAY)
        }
    }

    @Test
    fun `a goal without minimum keeps the historical behaviour`() {
        val goal = HabitGoal(targetMinor = 5, period = PeriodType.DAY)

        assertEquals(5, goal.effectiveMinimumMinor)
    }
}
