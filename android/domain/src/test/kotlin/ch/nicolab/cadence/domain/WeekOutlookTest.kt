package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Regroupement des habitudes de la semaine par ce qu'il reste réellement à faire. */
class WeekOutlookTest {

    private val zone = ZoneId.of("Europe/Zurich")
    private val wednesday = LocalDate.of(2026, 9, 16)

    private fun habit(
        id: String,
        target: Long = 10,
        minimum: Long? = null,
        period: PeriodType = PeriodType.WEEK,
        mode: ScheduleMode = ScheduleMode.EVERY_DAY,
        days: Set<DayOfWeek> = DayOfWeek.entries.toSet(),
        direction: GoalDirection = GoalDirection.AT_LEAST,
        goalType: GoalType = GoalType.QUANTITY,
    ) = HabitDefinition(
        id = id,
        goal = HabitGoal(target, period, goalType, minimumMinor = minimum, direction = direction),
        schedule = HabitSchedule(mode, days, DayOfWeek.MONDAY, 2),
    )

    private fun entry(id: String, habitId: String, value: Long, date: LocalDate) = HabitEntry(
        id = id,
        habitId = habitId,
        occurredAt = Instant.parse("2026-09-16T08:00:00Z"),
        localDate = date,
        observedZoneId = zone,
        valueMinor = value,
        sessionId = id,
    )

    private fun outlook(habits: List<HabitDefinition>, entries: List<HabitEntry>, pauses: List<HabitPause> = emptyList()) =
        WeekOutlook.of(habits, wednesday, entries) { pauses }

    @Test
    fun `an untouched habit is still to do`() {
        val result = outlook(listOf(habit("a")), emptyList())

        assertEquals(listOf("a"), result.byStage.getValue(WeekStage.TODO).map { it.habit.id })
        assertEquals(emptyList<String>(), result.byStage.getValue(WeekStage.WELL_UNDERWAY).map { it.habit.id })
    }

    @Test
    fun `a habit past halfway is well underway`() {
        val entries = listOf(entry("e1", "a", 6, wednesday))

        assertEquals(listOf("a"), outlook(listOf(habit("a")), entries).byStage.getValue(WeekStage.WELL_UNDERWAY).map { it.habit.id })
    }

    @Test
    fun `exactly halfway is not yet well underway`() {
        val entries = listOf(entry("e1", "a", 5, wednesday))

        assertEquals(listOf("a"), outlook(listOf(habit("a")), entries).byStage.getValue(WeekStage.TODO).map { it.habit.id })
    }

    @Test
    fun `reaching the minimum takes precedence over being well underway`() {
        val withMinimum = habit("a", target = 10, minimum = 4)
        val entries = listOf(entry("e1", "a", 4, wednesday))

        val result = outlook(listOf(withMinimum), entries)

        assertEquals(listOf("a"), result.byStage.getValue(WeekStage.MINIMUM).map { it.habit.id })
        assertEquals(emptyList<String>(), result.byStage.getValue(WeekStage.WELL_UNDERWAY).map { it.habit.id })
    }

    @Test
    fun `the ideal marks the habit as done`() {
        val entries = listOf(entry("e1", "a", 10, wednesday))

        assertEquals(listOf("a"), outlook(listOf(habit("a")), entries).byStage.getValue(WeekStage.DONE).map { it.habit.id })
    }

    @Test
    fun `a limited habit under its ceiling is done, there is nothing to chase`() {
        val coffee = habit("a", target = 2, direction = GoalDirection.AT_MOST, goalType = GoalType.COUNT, period = PeriodType.DAY)

        assertEquals(listOf("a"), outlook(listOf(coffee), emptyList()).byStage.getValue(WeekStage.DONE).map { it.habit.id })
    }

    @Test
    fun `a limited habit over its ceiling comes back as to do`() {
        val coffee = habit("a", target = 2, direction = GoalDirection.AT_MOST, goalType = GoalType.COUNT, period = PeriodType.DAY)
        val entries = listOf(entry("e1", "a", 3, wednesday))

        assertEquals(listOf("a"), outlook(listOf(coffee), entries).byStage.getValue(WeekStage.TODO).map { it.habit.id })
    }

    @Test
    fun `a habit not planned any more this week is left out entirely`() {
        // Habitude du lundi seulement : le lundi est passé, plus rien cette semaine.
        val mondayOnly = habit("a", mode = ScheduleMode.SELECTED_DAYS, days = setOf(DayOfWeek.MONDAY))

        val result = outlook(listOf(mondayOnly), emptyList())

        assertEquals(emptyList<String>(), result.byStage.values.flatten().map { it.habit.id })
    }

    @Test
    fun `a habit still planned later this week stays visible`() {
        val fridayOnly = habit("a", mode = ScheduleMode.SELECTED_DAYS, days = setOf(DayOfWeek.FRIDAY))

        assertEquals(listOf("a"), outlook(listOf(fridayOnly), emptyList()).byStage.getValue(WeekStage.TODO).map { it.habit.id })
    }

    @Test
    fun `a flexible rhythm stays visible all week`() {
        val flexible = habit("a", mode = ScheduleMode.FLEXIBLE_PERIOD)

        assertEquals(listOf("a"), outlook(listOf(flexible), emptyList()).byStage.getValue(WeekStage.TODO).map { it.habit.id })
    }

    @Test
    fun `a paused habit disappears from the week`() {
        val pauses = listOf(HabitPause.travel(wednesday.minusDays(2), wednesday.plusDays(4)))

        val result = outlook(listOf(habit("a")), emptyList(), pauses)

        assertEquals(emptyList<String>(), result.byStage.values.flatten().map { it.habit.id })
    }

    @Test
    fun `an archived habit never shows up`() {
        val archived = HabitDefinition(
            id = "a",
            archived = true,
            goal = HabitGoal(10, PeriodType.WEEK),
            schedule = HabitSchedule(ScheduleMode.EVERY_DAY),
        )

        assertEquals(emptyList<String>(), outlook(listOf(archived), emptyList()).byStage.values.flatten().map { it.habit.id })
    }

    @Test
    fun `every stage is present even when empty`() {
        assertEquals(WeekStage.entries.toSet(), outlook(emptyList(), emptyList()).byStage.keys)
    }
}
