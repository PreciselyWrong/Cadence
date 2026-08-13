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
    fun `daily goal includes only entries from the evaluated day`() {
        val habit = habit(target = 4, period = PeriodType.DAY)
        val result = evaluator.evaluate(
            habit = habit,
            date = LocalDate.of(2026, 8, 13),
            entries = listOf(entry("2026-08-12", 3), entry("2026-08-13", 2)),
        )

        assertEquals(2, result.progressMinor)
        assertTrue(result.requiresAction)
    }

    @Test
    fun `weekly quantity accumulates entries across different days`() {
        val habit = habit(target = 60, period = PeriodType.WEEK, firstDay = DayOfWeek.MONDAY)
        val result = evaluator.evaluate(
            habit = habit,
            date = LocalDate.of(2026, 8, 15),
            entries = listOf(entry("2026-08-11", 20), entry("2026-08-13", 15), entry("2026-08-15", 25)),
        )

        assertEquals(60, result.progressMinor)
        assertFalse(result.requiresAction)
    }

    @Test
    fun `month starts on its first civil day`() {
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
    fun `weekly boundaries honor any configured first day`() {
        val date = LocalDate.of(2026, 8, 13)

        assertEquals(LocalDate.of(2026, 8, 10), PeriodCalculator.window(date, PeriodType.WEEK, DayOfWeek.MONDAY).start)
        assertEquals(LocalDate.of(2026, 8, 9), PeriodCalculator.window(date, PeriodType.WEEK, DayOfWeek.SUNDAY).start)
        assertEquals(LocalDate.of(2026, 8, 8), PeriodCalculator.window(date, PeriodType.WEEK, DayOfWeek.SATURDAY).start)
    }

    @Test
    fun `exceeding a target completes it without truncating progress`() {
        val result = evaluator.evaluate(
            habit = habit(target = 60, period = PeriodType.WEEK),
            date = LocalDate.of(2026, 8, 13),
            entries = listOf(entry("2026-08-11", 65)),
        )

        assertEquals(65, result.progressMinor)
        assertFalse(result.requiresAction)
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
        assertFalse(result.requiresAction)
        assertFalse(result.countsAsFailure)
    }

    @Test
    fun `entry civil date remains stable after timezone change`() {
        val instant = Instant.parse("2026-08-13T22:30:00Z")
        val entry = HabitEntry(
            id = "entry",
            habitId = "habit",
            occurredAt = instant,
            localDate = LocalDate.of(2026, 8, 14),
            observedZoneId = ZoneId.of("Europe/Zurich"),
            valueMinor = 1,
        )

        val result = evaluator.evaluate(
            habit = habit(target = 1),
            date = LocalDate.of(2026, 8, 14),
            entries = listOf(entry),
        )

        assertFalse(result.requiresAction)
        assertEquals(LocalDate.of(2026, 8, 14), entry.localDate)
    }

    @Test
    fun `retroactive entry addition and deletion are reflected by recalculation`() {
        val habit = habit(target = 4)
        val date = LocalDate.of(2026, 8, 13)
        val original = entry("2026-08-13", 2, id = "original")
        val retroactive = entry("2026-08-13", 2, id = "retroactive")

        assertTrue(evaluator.evaluate(habit, date, listOf(original)).requiresAction)
        assertFalse(evaluator.evaluate(habit, date, listOf(original, retroactive)).requiresAction)
        assertTrue(evaluator.evaluate(habit, date, listOf(original)).requiresAction)
    }

    @Test
    fun `new period does not inherit previous period progress`() {
        val habit = habit(target = 1)
        val result = evaluator.evaluate(habit, LocalDate.of(2026, 8, 14), listOf(entry("2026-08-13", 1)))

        assertEquals(0, result.progressMinor)
        assertTrue(result.requiresAction)
    }

    @Test
    fun `inactive unplanned paused and completed habits are excluded from pending actions`() {
        val date = LocalDate.of(2026, 8, 13)
        val pending = PendingHabitsResolver(evaluator).resolve(
            habits = listOf(
                habit(id = "pending", target = 1),
                habit(id = "completed", target = 1),
                habit(id = "inactive", target = 1, active = false),
                habit(id = "unplanned", target = 1, activeDays = setOf(DayOfWeek.FRIDAY)),
                habit(id = "paused", target = 1),
            ),
            date = date,
            entries = listOf(entry("2026-08-13", 1, habitId = "completed")),
            pauses = mapOf("paused" to listOf(HabitPause(date, date.plusDays(1)))),
        )

        assertEquals(listOf("pending"), pending.map { it.habit.id })
    }

    private fun habit(
        id: String = "habit",
        target: Long,
        period: PeriodType = PeriodType.DAY,
        firstDay: DayOfWeek = DayOfWeek.MONDAY,
        active: Boolean = true,
        activeDays: Set<DayOfWeek> = DayOfWeek.entries.toSet(),
    ) = HabitDefinition(
        id = id,
        active = active,
        goal = HabitGoal(targetMinor = target, period = period),
        schedule = HabitSchedule(activeDays = activeDays, firstDayOfWeek = firstDay),
    )

    private fun entry(
        date: String,
        value: Long,
        id: String = "entry-$date-$value",
        habitId: String = "habit",
    ) = HabitEntry(
        id = id,
        habitId = habitId,
        occurredAt = LocalDate.parse(date).atStartOfDay(ZoneId.of("Europe/Zurich")).toInstant(),
        localDate = LocalDate.parse(date),
        observedZoneId = ZoneId.of("Europe/Zurich"),
        valueMinor = value,
    )
}
