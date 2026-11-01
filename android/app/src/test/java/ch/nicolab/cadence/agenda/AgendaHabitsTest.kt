package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AgendaHabitsTest {

    private val friday = LocalDate.of(2026, 10, 30)
    private val saturday = friday.plusDays(1)

    private fun habit(
        id: String,
        goal: HabitGoal = HabitGoal(1, PeriodType.DAY, GoalType.BINARY),
        schedule: HabitSchedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        groupId: String = HabitGroup.ALL_DAY_ID,
        color: Int? = null,
    ) = PersistedHabit(
        id = id, name = id, active = true, groupId = groupId, colorArgb = color, goal = goal, schedule = schedule,
    )

    private val groups = listOf(
        HabitGroup(HabitGroup.ALL_DAY_ID, "Journée", null, null, 0),
        HabitGroup("morning", "Matin", 8 * 60, 12 * 60, 1),
    )

    private fun entries(
        habits: List<PersistedHabit>,
        days: List<LocalDate> = listOf(friday),
        pauses: Map<String, List<HabitPause>> = emptyMap(),
        done: Map<String, Set<LocalDate>> = emptyMap(),
    ) = habitAgendaEntries(habits, groups, pauses, done, days)

    @Test
    fun `scheduled habit becomes an all-day entry`() {
        val entry = entries(listOf(habit("h", color = 5))).single()
        assertEquals("h", entry.habitId)
        assertTrue(entry.allDay)
        assertEquals(friday.atStartOfDay(), entry.start)
        assertEquals(friday.plusDays(1).atStartOfDay(), entry.end)
        assertEquals(5, entry.colorArgb)
    }

    @Test
    fun `habit in a timed group sits at the group start`() {
        val entry = entries(listOf(habit("h", groupId = "morning"))).single()
        assertEquals(false, entry.allDay)
        assertEquals(LocalDateTime.of(2026, 10, 30, 8, 0), entry.start)
    }

    @Test
    fun `selected days only`() {
        val fridays = HabitSchedule(setOf(DayOfWeek.FRIDAY), DayOfWeek.MONDAY)
        val result = entries(listOf(habit("h", schedule = fridays)), listOf(friday, saturday))
        assertEquals(listOf(friday), result.map { it.start.toLocalDate() })
    }

    private val flexibleWeekly = habit(
        "flex",
        goal = HabitGoal(3, PeriodType.WEEK, GoalType.BINARY),
        schedule = HabitSchedule(mode = ScheduleMode.FLEXIBLE_PERIOD),
    )
    private val tracker = habit("track", goal = HabitGoal(0, PeriodType.DAY, GoalType.QUANTITY, direction = GoalDirection.TRACK_ONLY))
    private val abstinence = habit("abs", goal = HabitGoal(0, PeriodType.DAY, GoalType.QUANTITY, direction = GoalDirection.AT_MOST))

    @Test
    fun `a flexible habit has no due day and shows nowhere while nothing is done`() {
        assertTrue(entries(listOf(flexibleWeekly, tracker), listOf(friday, saturday)).isEmpty())
    }

    @Test
    fun `a flexible habit shows only on the days it was done, flagged done`() {
        val result = entries(listOf(flexibleWeekly), listOf(friday, saturday), done = mapOf("flex" to setOf(saturday)))
        assertEquals(listOf(saturday), result.map { it.start.toLocalDate() })
        assertEquals(listOf(true), result.map { it.done })
    }

    @Test
    fun `a flexible habit in a timed group sits at the group start on its done day`() {
        val flexibleMorning = habit(
            "flex",
            goal = HabitGoal(3, PeriodType.WEEK, GoalType.BINARY),
            schedule = HabitSchedule(mode = ScheduleMode.FLEXIBLE_PERIOD),
            groupId = "morning",
        )
        val entry = entries(listOf(flexibleMorning), done = mapOf("flex" to setOf(friday))).single()
        assertEquals(LocalDateTime.of(2026, 10, 30, 8, 0), entry.start)
        assertEquals(false, entry.allDay)
    }

    @Test
    fun `a flexible habit done on a paused day is left out`() {
        val pause = HabitPause(friday, saturday)
        val result = entries(
            listOf(flexibleWeekly),
            listOf(friday, saturday),
            pauses = mapOf("flex" to listOf(pause)),
            done = mapOf("flex" to setOf(friday, saturday)),
        )
        assertEquals(listOf(saturday), result.map { it.start.toLocalDate() })
    }

    @Test
    fun `a flexible habit does not show on a day before it started`() {
        val started = flexibleWeekly.copy(startsOn = saturday)
        val result = entries(listOf(started), listOf(friday, saturday), done = mapOf("flex" to setOf(friday, saturday)))
        assertEquals(listOf(saturday), result.map { it.start.toLocalDate() })
    }

    @Test
    fun `a tracker shows on the days it has an entry, even paused`() {
        val pause = HabitPause(friday, saturday)
        val result = entries(listOf(tracker), listOf(friday, saturday), pauses = mapOf("track" to listOf(pause)), done = mapOf("track" to setOf(friday)))
        assertEquals(listOf(friday), result.map { it.start.toLocalDate() })
    }

    @Test
    fun `abstinence habits are never on the agenda`() {
        assertTrue(entries(listOf(abstinence), done = mapOf("abs" to setOf(friday))).isEmpty())
    }

    @Test
    fun `paused days are skipped`() {
        val pause = HabitPause(friday, saturday)
        val result = entries(listOf(habit("h")), listOf(friday, saturday), pauses = mapOf("h" to listOf(pause)))
        assertEquals(listOf(saturday), result.map { it.start.toLocalDate() })
    }

    @Test
    fun `done follows recorded days`() {
        val result = entries(listOf(habit("h")), listOf(friday, saturday), done = mapOf("h" to setOf(friday)))
        assertEquals(listOf(true, false), result.map { it.done })
    }

    @Test
    fun `limit habits are never done`() {
        val limit = habit("lim", goal = HabitGoal(2, PeriodType.DAY, GoalType.QUANTITY, direction = GoalDirection.AT_MOST))
        assertEquals(false, entries(listOf(limit), done = mapOf("lim" to setOf(friday))).single().done)
    }
}
