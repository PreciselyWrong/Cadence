package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitEvaluatorTest {
    private val evaluator = HabitEvaluator()

    @Test
    fun `exact cardio 15+20+25 completes target of 60 minutes`() {
        val habit = habit(
            target = 60,
            period = PeriodType.WEEK,
            goalType = GoalType.DURATION,
            unit = MeasurementUnit.MINUTES,
        )
        val result = evaluator.evaluate(
            habit = habit,
            date = LocalDate.of(2026, 8, 15),
            entries = listOf(
                entry("2026-08-11", 15),
                entry("2026-08-13", 20),
                entry("2026-08-15", 25),
            ),
        )

        assertEquals(60, result.progressMinor)
        assertTrue(result.completedQuantity)
        assertTrue(result.isCompleted)
        assertFalse(result.needsAttentionNow)
    }

    @Test
    fun `partial cardio 15+20 is incomplete against target of 60`() {
        val habit = habit(
            target = 60,
            period = PeriodType.WEEK,
            goalType = GoalType.DURATION,
            unit = MeasurementUnit.MINUTES,
        )
        val result = evaluator.evaluate(
            habit = habit,
            date = LocalDate.of(2026, 8, 13),
            entries = listOf(
                entry("2026-08-11", 15),
                entry("2026-08-13", 20),
            ),
        )

        assertEquals(35, result.progressMinor)
        assertFalse(result.completedQuantity)
        assertFalse(result.isCompleted)
        assertTrue(result.needsAttentionNow)
    }

    @Test
    fun `next week evaluates zero progress regardless of previous week entries`() {
        val habit = habit(target = 60, period = PeriodType.WEEK)
        val result = evaluator.evaluate(
            habit = habit,
            date = LocalDate.of(2026, 8, 17), // Next Monday
            entries = listOf(entry("2026-08-13", 60)), // Previous week Thursday
        )

        assertEquals(0, result.progressMinor)
        assertFalse(result.isCompleted)
        assertTrue(result.needsAttentionNow)
    }

    @Test
    fun `Thursday boundary starts week window on Thursday`() {
        val date = LocalDate.of(2026, 8, 13) // A Thursday
        val window = PeriodCalculator.window(date, PeriodType.WEEK, firstDayOfWeek = DayOfWeek.THURSDAY)

        assertEquals(LocalDate.of(2026, 8, 13), window.start)
        assertEquals(LocalDate.of(2026, 8, 20), window.endExclusive)
    }

    @Test
    fun `two habits with different week starts evaluate independent windows on same date`() {
        val evalDate = LocalDate.of(2026, 8, 13) // Thursday
        val habitMonday = habit(id = "h-mon", target = 60, period = PeriodType.WEEK, firstDay = DayOfWeek.MONDAY)
        val habitThursday = habit(id = "h-thu", target = 60, period = PeriodType.WEEK, firstDay = DayOfWeek.THURSDAY)

        // Entry on Wednesday 2026-08-12
        val wednesdayEntry = entry("2026-08-12", 40)

        val resMon = evaluator.evaluate(habitMonday, evalDate, listOf(wednesdayEntry.copy(habitId = "h-mon")))
        val resThu = evaluator.evaluate(habitThursday, evalDate, listOf(wednesdayEntry.copy(habitId = "h-thu")))

        assertEquals(40, resMon.progressMinor) // In Monday-Sunday week
        assertEquals(0, resThu.progressMinor)   // Before Thursday-Wednesday week
    }

    @Test
    fun `daily counter tracks count progress towards daily goal`() {
        val habit = habit(
            target = 8,
            period = PeriodType.DAY,
            goalType = GoalType.COUNT,
            unit = MeasurementUnit.COUNT,
        )
        val date = LocalDate.of(2026, 8, 13)

        val partial = evaluator.evaluate(
            habit,
            date,
            (1..5).map { entry("2026-08-13", 1, id = "e-$it") },
        )
        assertEquals(5, partial.progressMinor)
        assertFalse(partial.isCompleted)
        assertTrue(partial.needsAttentionNow)

        val complete = evaluator.evaluate(
            habit,
            date,
            (1..8).map { entry("2026-08-13", 1, id = "e-$it") },
        )
        assertEquals(8, complete.progressMinor)
        assertTrue(complete.isCompleted)
        assertFalse(complete.needsAttentionNow)
    }

    @Test
    fun `binary goal requires action on next day after being completed today`() {
        val habit = habit(target = 1, period = PeriodType.DAY, goalType = GoalType.BINARY)
        val day1 = LocalDate.of(2026, 8, 13)
        val day2 = LocalDate.of(2026, 8, 14)
        val entries = listOf(entry("2026-08-13", 1))

        val day1Result = evaluator.evaluate(habit, day1, entries)
        assertTrue(day1Result.isCompleted)
        assertFalse(day1Result.needsAttentionNow)

        val day2Result = evaluator.evaluate(habit, day2, entries)
        assertFalse(day2Result.isCompleted)
        assertTrue(day2Result.needsAttentionNow)
    }

    @Test
    fun `flexible weekly planning allows completion on any day in the period`() {
        val habit = habit(
            target = 3,
            period = PeriodType.WEEK,
            mode = ScheduleMode.FLEXIBLE_PERIOD,
            frequencyTarget = 3,
        )
        val tuesday = LocalDate.of(2026, 8, 11)

        val resultBefore = evaluator.evaluate(habit, tuesday, emptyList())
        assertTrue(resultBefore.isPlannedForDate)
        assertTrue(resultBefore.needsAttentionNow)

        val resultAfter = evaluator.evaluate(
            habit = habit,
            date = tuesday,
            entries = listOf(
                entry("2026-08-10", 1, sessionId = "s1"),
                entry("2026-08-11", 1, sessionId = "s2"),
                entry("2026-08-12", 1, sessionId = "s3"),
            ),
        )
        assertTrue(resultAfter.isCompleted)
        assertFalse(resultAfter.needsAttentionNow)
    }

    @Test
    fun `frequency target is distinct from quantity target`() {
        val habit = habit(
            target = 60,
            period = PeriodType.WEEK,
            goalType = GoalType.DURATION,
            unit = MeasurementUnit.MINUTES,
            frequencyTarget = 3,
        )
        val date = LocalDate.of(2026, 8, 15)

        // 1 session of 60 mins -> quantity target met, frequency target NOT met
        val singleSession = evaluator.evaluate(
            habit,
            date,
            listOf(entry("2026-08-11", 60, sessionId = "sess-1")),
        )
        assertTrue(singleSession.completedQuantity)
        assertFalse(singleSession.completedFrequency)
        assertFalse(singleSession.isCompleted)
        assertEquals(1, singleSession.sessionCount)

        // 3 sessions of 10 mins -> frequency target met, quantity target NOT met
        val threeShortSessions = evaluator.evaluate(
            habit,
            date,
            listOf(
                entry("2026-08-10", 10, sessionId = "sess-1"),
                entry("2026-08-12", 10, sessionId = "sess-2"),
                entry("2026-08-14", 10, sessionId = "sess-3"),
            ),
        )
        assertFalse(threeShortSessions.completedQuantity)
        assertTrue(threeShortSessions.completedFrequency)
        assertFalse(threeShortSessions.isCompleted)
        assertEquals(3, threeShortSessions.sessionCount)

        // 3 sessions totaling 60 mins -> BOTH met
        val threeGoodSessions = evaluator.evaluate(
            habit,
            date,
            listOf(
                entry("2026-08-10", 20, sessionId = "sess-1"),
                entry("2026-08-12", 20, sessionId = "sess-2"),
                entry("2026-08-14", 20, sessionId = "sess-3"),
            ),
        )
        assertTrue(threeGoodSessions.completedQuantity)
        assertTrue(threeGoodSessions.completedFrequency)
        assertTrue(threeGoodSessions.isCompleted)
    }

    @Test
    fun `date start and archive filtering exclude unstarted or archived habits from attention`() {
        val date = LocalDate.of(2026, 8, 13)

        val unstartedHabit = habit(target = 1, startsOn = LocalDate.of(2026, 9, 1))
        val evalUnstarted = evaluator.evaluate(unstartedHabit, date, emptyList())
        assertFalse(evalUnstarted.isPlannedForDate)
        assertFalse(evalUnstarted.needsAttentionNow)

        val archivedHabit = habit(target = 1, archived = true)
        val evalArchived = evaluator.evaluate(archivedHabit, date, emptyList())
        assertFalse(evalArchived.isPlannedForDate)
        assertFalse(evalArchived.needsAttentionNow)

        val pendingList = PendingHabitsResolver(evaluator).resolve(
            habits = listOf(unstartedHabit, archivedHabit, habit(id = "active", target = 1)),
            date = date,
            entries = emptyList(),
        )
        assertEquals(listOf("active"), pendingList.map { it.habit.id })
    }

    @Test
    fun `duration normalization scales 30 min plus 1 h to 5400 seconds canonical or 90 min`() {
        val habit = habit(
            target = 5400, // 90 mins in seconds
            period = PeriodType.DAY,
            goalType = GoalType.DURATION,
            unit = MeasurementUnit.SECONDS,
        )
        val date = LocalDate.of(2026, 8, 13)

        // 30 min (1800s) + 1 h (3600s) = 5400s (90 mins)
        val entry30Min = entry("2026-08-13", 30 * MeasurementUnit.MINUTES.scaleToCanonical)
        val entry1Hour = entry("2026-08-13", 1 * MeasurementUnit.HOURS.scaleToCanonical)

        val result = evaluator.evaluate(habit, date, listOf(entry30Min, entry1Hour))
        assertEquals(5400, result.progressMinor)
        val minutesProgress = result.progressMinor / MeasurementUnit.MINUTES.scaleToCanonical
        assertEquals(90, minutesProgress)
        assertTrue(result.isCompleted)
    }

    @Test
    fun `monthly goal starts on first day of month`() {
        val habit = habit(target = 10, period = PeriodType.MONTH)
        val result = evaluator.evaluate(
            habit = habit,
            date = LocalDate.of(2026, 8, 31),
            entries = listOf(entry("2026-07-31", 8), entry("2026-08-01", 3)),
        )

        assertEquals(LocalDate.of(2026, 8, 1), result.period.start)
        assertEquals(LocalDate.of(2026, 9, 1), result.period.endExclusive)
        assertEquals(3, result.progressMinor)
    }

    @Test
    fun `pause hides a habit and is not treated as a failed period`() {
        val result = evaluator.evaluate(
            habit = habit(target = 1),
            date = LocalDate.of(2026, 8, 13),
            entries = emptyList(),
            pauses = listOf(HabitPause(LocalDate.of(2026, 8, 10), LocalDate.of(2026, 8, 15))),
        )

        assertTrue(result.isPaused)
        assertFalse(result.needsAttentionNow)
        assertFalse(result.countsAsFailure)
    }

    private fun habit(
        id: String = "habit",
        target: Long,
        period: PeriodType = PeriodType.DAY,
        goalType: GoalType = GoalType.QUANTITY,
        unit: MeasurementUnit? = null,
        frequencyTarget: Int? = null,
        mode: ScheduleMode = ScheduleMode.SELECTED_DAYS,
        firstDay: DayOfWeek = DayOfWeek.MONDAY,
        active: Boolean = true,
        startsOn: LocalDate = LocalDate.of(1970, 1, 1),
        archived: Boolean = false,
        activeDays: Set<DayOfWeek> = DayOfWeek.entries.toSet(),
    ) = HabitDefinition(
        id = id,
        name = "Test Habit",
        active = active,
        startsOn = startsOn,
        archived = archived,
        goal = HabitGoal(
            targetMinor = target,
            period = period,
            goalType = goalType,
            unit = unit,
            frequencyTarget = frequencyTarget,
        ),
        schedule = HabitSchedule(
            mode = mode,
            activeDays = activeDays,
            firstDayOfWeek = firstDay,
        ),
    )

    private fun entry(
        date: String,
        value: Long,
        id: String = "entry-$date-$value",
        habitId: String = "habit",
        sessionId: String? = null,
    ) = HabitEntry(
        id = id,
        habitId = habitId,
        occurredAt = LocalDate.parse(date).atStartOfDay(ZoneId.of("Europe/Zurich")).toInstant(),
        localDate = LocalDate.parse(date),
        observedZoneId = ZoneId.of("Europe/Zurich"),
        valueMinor = value,
        sessionId = sessionId,
    )
}
