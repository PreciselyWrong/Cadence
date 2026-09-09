package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TodayPresentationTest {
    private val today = LocalDate.of(2026, 9, 9)
    private fun evaluation(id: String = "h", group: String = HabitGroup.ALL_DAY_ID, goal: HabitGoal = HabitGoal(10, PeriodType.DAY), active: Boolean = true): HabitEvaluation =
        HabitEvaluator().evaluate(HabitDefinition(id = id, groupId = group, goal = goal, active = active, schedule = HabitSchedule(ScheduleMode.EVERY_DAY)), today, emptyList())

    @Test fun `direct quantity respects user's first preset and default unit`() {
        assertEquals(5L, TodayPresentation.directAmount(evaluation(), listOf(0, 5, 2)))
        assertEquals(60L, TodayPresentation.directAmount(evaluation(goal = HabitGoal(600, PeriodType.DAY, GoalType.DURATION, MeasurementUnit.MINUTES)), emptyList()))
    }

    @Test fun `limit direct action never exceeds remaining room`() {
        val limit = evaluation(goal = HabitGoal(10, PeriodType.DAY, direction = GoalDirection.AT_MOST)).copy(progressMinor = 8)
        assertEquals(2L, TodayPresentation.directAmount(limit, listOf(5)))
        assertNull(TodayPresentation.directAmount(limit.copy(progressMinor = 10), listOf(5)))
        assertNull(TodayPresentation.directAmount(limit.copy(progressMinor = 11), listOf(5)))
    }

    @Test fun `direct action unavailable for pause archive and abstinence`() {
        assertNull(TodayPresentation.directAmount(evaluation(active = false), listOf(1)))
        assertNull(TodayPresentation.directAmount(evaluation().copy(isPaused = true), listOf(1)))
        assertNull(TodayPresentation.directAmount(evaluation().copy(isPlannedForDate = false), listOf(1)))
        assertNull(TodayPresentation.directAmount(evaluation().copy(isCompleted = true), listOf(1)))
        assertNull(TodayPresentation.directAmount(evaluation(goal = HabitGoal(0, PeriodType.DAY, direction = GoalDirection.AT_MOST)), listOf(1)))
    }

    @Test fun `binary validates remaining amount and independent frequency`() {
        val binary = evaluation(goal = HabitGoal(3, PeriodType.WEEK, GoalType.BINARY, frequencyTarget = 2))
        assertEquals(2L, TodayPresentation.directAmount(binary.copy(progressMinor = 1), emptyList()))
        assertEquals(3L, TodayPresentation.directAmount(binary.copy(progressMinor = 3, completedQuantity = true, completedFrequency = false), emptyList()))
    }

    @Test fun `sections retain input order and handle overlapping overnight and all day groups`() {
        val morning = HabitGroup("morning", "Matin", 300, 720, 1)
        val night = HabitGroup("night", "Nuit", 1320, 120, 2)
        val overlap = HabitGroup("overlap", "Tard", 1380, 180, 3)
        val full = HabitGroup("full", "Libre", 420, 420, 4)
        val values = listOf(evaluation("a", "night"), evaluation("b", "missing"), evaluation("c", "morning"), evaluation("d", "overlap"), evaluation("e", "full"))
        val late = TodayPresentation.sections(values, listOf(morning, night, overlap, full), LocalTime.of(23, 30))
        assertEquals(listOf("a", "b", "d", "e"), late.now.map { it.habit.id })
        assertEquals(listOf("c"), late.earlier.map { it.habit.id })
        val midday = TodayPresentation.sections(values, listOf(morning, night, overlap, full), LocalTime.NOON)
        assertEquals(listOf("a", "d"), midday.later.map { it.habit.id })
    }

    @Test fun `limits remain visible at and above maximum and never enter completed`() {
        val limit = evaluation("limit", goal = HabitGoal(2, PeriodType.DAY, direction = GoalDirection.AT_MOST))
        val done = evaluation("done").copy(isCompleted = true, needsAttentionNow = false)
        val result = TodayPresentation.sections(listOf(limit.copy(progressMinor = 3, isCompleted = false, needsAttentionNow = false), done), emptyList(), LocalTime.NOON)
        assertEquals(listOf("limit"), result.now.map { it.habit.id })
        assertEquals(listOf("done"), result.completed.map { it.habit.id })
        assertTrue(TodayPresentation.sections(listOf(limit), emptyList(), LocalTime.NOON).completed.isEmpty())
    }

    @Test fun `pause unscheduled inactive and abstinence are excluded from ordinary sections`() {
        val values = listOf(evaluation(active = false), evaluation().copy(isPaused = true), evaluation().copy(isPlannedForDate = false), evaluation(goal = HabitGoal(0, PeriodType.DAY, direction = GoalDirection.AT_MOST)))
        assertEquals(TodaySections(emptyList(), emptyList(), emptyList(), emptyList()), TodayPresentation.sections(values, emptyList(), LocalTime.NOON))
    }

    @Test fun `return starts at seven days and recent widget activity suppresses it`() {
        assertTrue(TodayPresentation.shouldOfferReturn(today.minusDays(7), null, today, true))
        assertFalse(TodayPresentation.shouldOfferReturn(today.minusDays(6), null, today, true))
        assertFalse(TodayPresentation.shouldOfferReturn(today.minusDays(20), today.minusDays(1), today, true))
        assertFalse(TodayPresentation.shouldOfferReturn(null, null, today, true))
        assertFalse(TodayPresentation.shouldOfferReturn(today.plusDays(1), null, today, true))
        assertFalse(TodayPresentation.shouldOfferReturn(today.minusDays(20), null, today, false))
    }
}
