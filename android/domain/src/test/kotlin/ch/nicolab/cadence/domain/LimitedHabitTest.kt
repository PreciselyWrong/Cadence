package ch.nicolab.cadence.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Une habitude à limiter réussit tant qu'elle reste sous son maximum. */
class LimitedHabitTest {

    private val evaluator = HabitEvaluator()
    private val date = LocalDate.of(2026, 7, 8)
    private val zone = ZoneId.of("Europe/Zurich")

    private fun coffee(max: Long = 2, startsOn: LocalDate = LocalDate.of(2020, 1, 1)) = HabitDefinition(
        id = "habit-1",
        startsOn = startsOn,
        goal = HabitGoal(
            targetMinor = max,
            period = PeriodType.DAY,
            goalType = GoalType.COUNT,
            direction = GoalDirection.AT_MOST,
        ),
        schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
    )

    private fun cups(count: Int) = (0 until count).map { index ->
        HabitEntry(
            id = "entry-$index",
            habitId = "habit-1",
            occurredAt = Instant.parse("2026-07-08T07:00:00Z").plusSeconds(index.toLong()),
            localDate = date,
            observedZoneId = zone,
            valueMinor = 1,
            sessionId = "session-$index",
        )
    }

    @Test
    fun `nothing consumed stays under the limit`() {
        val result = evaluator.evaluate(coffee(), date, emptyList())

        assertEquals(LimitStatus.UNDER, result.limitStatus)
        assertTrue(result.validatesPeriod)
        assertFalse(result.countsAsFailure)
    }

    @Test
    fun `staying below the limit is a success and still leaves room`() {
        val result = evaluator.evaluate(coffee(), date, cups(1))

        assertEquals(LimitStatus.UNDER, result.limitStatus)
        assertTrue(result.validatesPeriod)
        // Il reste de la place : l'habitude reste accessible à la saisie rapide.
        assertTrue(result.needsAttentionNow)
    }

    @Test
    fun `reaching the limit still validates the period but closes the room`() {
        val result = evaluator.evaluate(coffee(), date, cups(2))

        assertEquals(LimitStatus.AT_LIMIT, result.limitStatus)
        assertTrue(result.validatesPeriod)
        assertFalse(result.countsAsFailure)
        assertFalse(result.needsAttentionNow)
    }

    @Test
    fun `exceeding the limit fails the period`() {
        val result = evaluator.evaluate(coffee(), date, cups(3))

        assertEquals(LimitStatus.EXCEEDED, result.limitStatus)
        assertFalse(result.validatesPeriod)
        assertTrue(result.countsAsFailure)
    }

    @Test
    fun `a paused limited habit is neither a success nor a failure to act on`() {
        val result = evaluator.evaluate(
            coffee(),
            date,
            cups(5),
            listOf(HabitPause.skip(date, PauseReason.REST)),
        )

        assertTrue(result.isPaused)
        assertFalse(result.countsAsFailure)
        assertFalse(result.needsAttentionNow)
    }

    @Test
    fun `an ordinary habit carries no limit status`() {
        val ordinary = HabitDefinition(
            id = "habit-1",
            goal = HabitGoal(targetMinor = 3, period = PeriodType.DAY),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )

        assertNull(evaluator.evaluate(ordinary, date, emptyList()).limitStatus)
    }

    @Test
    fun `a limit refuses a minimum, which would have no meaning`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitGoal(
                targetMinor = 2,
                minimumMinor = 1,
                period = PeriodType.DAY,
                direction = GoalDirection.AT_MOST,
            )
        }
    }

    @Test
    fun `a limit refuses a binary goal, which cannot be counted`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitGoal(
                targetMinor = 1,
                period = PeriodType.DAY,
                goalType = GoalType.BINARY,
                direction = GoalDirection.AT_MOST,
            )
        }
    }

    @Test
    fun `every past period held under the limit counts in the streak`() {
        val habit = coffee(startsOn = date.minusDays(3))
        val entries = (1..3).flatMap { back ->
            cups(1).map { it.copy(id = "past-$back", localDate = date.minusDays(back.toLong())) }
        }

        assertEquals(3, StreakCalculator.compute({ habit }, date, entries, emptyList()).current)
    }

    @Test
    fun `a past period without any entry also holds under the limit`() {
        val habit = coffee(startsOn = date.minusDays(3))

        // Ne rien consommer, c'est ne pas depasser : les trois journees passees comptent.
        assertEquals(3, StreakCalculator.compute({ habit }, date, emptyList(), emptyList()).current)
    }

    @Test
    fun `the running period never counts early for a limit`() {
        val habit = coffee(startsOn = date)

        // Aujourd'hui est sous la limite, mais la journée n'est pas finie : rien n'est acquis.
        assertEquals(0, StreakCalculator.compute({ habit }, date, emptyList(), emptyList()).current)
    }

    @Test
    fun `exceeding the limit breaks the streak`() {
        val habit = coffee(startsOn = date.minusDays(2))
        val entries = cups(3).mapIndexed { index, entry ->
            entry.copy(id = "over-$index", localDate = date.minusDays(1))
        }

        assertEquals(0, StreakCalculator.compute({ habit }, date, entries, emptyList()).current)
    }
}
