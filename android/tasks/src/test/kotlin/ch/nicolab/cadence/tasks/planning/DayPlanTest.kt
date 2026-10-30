package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DayPlanTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val friday = LocalDate.of(2026, 10, 30)
    private val settings = PlanningSettings()

    private fun at(hour: Int, minute: Int = 0): Instant = friday.atTime(hour, minute).atZone(zone).toInstant()
    private fun hm(hour: Int, minute: Int = 0) = hour * 60 + minute

    private fun task(uid: String, minutes: Int? = null, timedAt: Instant? = null) = TaskItem(
        uid = uid,
        name = uid,
        dueDay = friday,
        dueDate = timedAt ?: at(23, 59),
        dueHasTime = timedAt != null,
        estimatedMinutes = minutes,
    )

    private fun event(startHour: Int, endHour: Int, allDay: Boolean = false) = CalendarEvent(
        calendarId = 1, eventId = startHour.toLong(),
        instanceBegin = if (allDay) friday.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() else at(startHour).toEpochMilli(),
        instanceEnd = if (allDay) friday.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() else at(endHour).toEpochMilli(),
        allDay = allDay, title = "e", location = null, colorArgb = 0,
    )

    @Test
    fun `capacity counts estimates and defaults to 30 minutes`() {
        val plan = DayPlans.of(friday, zone, settings, emptyList(), listOf(task("a", 90), task("b")))
        assertEquals(120, plan.capacity.plannedMinutes)
        assertEquals(9 * 60, plan.capacity.availableMinutes)
        assertEquals(7 * 60, plan.capacity.freeMinutes)
    }

    @Test
    fun `events and protected slots reduce what is available, all-day events do not`() {
        val focus = settings.copy(focusBlocks = listOf(FocusBlock("Focus", LocalTime.of(14, 0), LocalTime.of(16, 0))))
        val plan = DayPlans.of(friday, zone, focus, listOf(event(10, 11), event(0, 0, allDay = true)), emptyList())
        assertEquals(9 * 60 - 60 - 120, plan.capacity.availableMinutes)
    }

    @Test
    fun `placement avoids events, protected slots and timed tasks`() {
        val focus = settings.copy(focusBlocks = listOf(FocusBlock("Focus", LocalTime.of(9, 0), LocalTime.of(10, 0))))
        val tasks = listOf(task("fixed", minutes = 60, timedAt = at(10, 45)), task("a", 30))
        val plan = DayPlans.of(friday, zone, focus, listOf(event(12, 13)), tasks)
        assertEquals(listOf("a"), plan.toPlace.map { it.uid })
        val placement = plan.propose()
        // 9:00-10:00 protégé, 10:45-11:45 tâche fixe, 12:00-13:00 événement : premier trou avec marge = 13:15.
        assertEquals(hm(13, 15), placement.blocks.single().start)
    }

    @Test
    fun `today does not offer minutes already gone`() {
        val plan = DayPlans.of(friday, zone, settings, emptyList(), emptyList(), notBefore = DayPlans.notBefore(friday, at(14, 3), zone))
        assertEquals(hm(18) - hm(14, 3), plan.capacity.availableMinutes)
        assertEquals(0, DayPlans.notBefore(friday.plusDays(1), at(14, 3), zone))
    }

    @Test
    fun `a day off has no workday flag and no capacity`() {
        val saturday = friday.plusDays(1)
        val plan = DayPlans.of(saturday, zone, settings, emptyList(), emptyList())
        assertFalse(plan.workday)
        assertEquals(0, plan.capacity.availableMinutes)
    }

    @Test
    fun `morning card shows on workdays before shutdown while there is something to plan`() {
        val noon = LocalTime.NOON
        assertTrue(DayRhythm.morningCardVisible(settings, friday, noon, null, overdueCount = 1, toPlaceCount = 0))
        assertTrue(DayRhythm.morningCardVisible(settings, friday, noon, null, overdueCount = 0, toPlaceCount = 2))
        assertFalse(DayRhythm.morningCardVisible(settings, friday, noon, null, 0, 0))
        assertFalse(DayRhythm.morningCardVisible(settings, friday, noon, friday, 1, 1))
        assertFalse(DayRhythm.morningCardVisible(settings, friday, LocalTime.of(18, 0), null, 1, 1))
        assertFalse(DayRhythm.morningCardVisible(settings, friday.plusDays(1), noon, null, 1, 1))
    }

    @Test
    fun `evening card shows from the shutdown hour until the day is closed`() {
        val evening = LocalTime.of(18, 0)
        assertTrue(DayRhythm.eveningCardVisible(settings, friday, evening, null, doneCount = 3, unfinishedCount = 2))
        assertFalse(DayRhythm.eveningCardVisible(settings, friday, LocalTime.of(17, 59), null, 3, 2))
        assertFalse(DayRhythm.eveningCardVisible(settings, friday, evening, friday, 3, 2))
        assertFalse(DayRhythm.eveningCardVisible(settings, friday, evening, null, 0, 0))
        assertTrue(DayRhythm.eveningCardVisible(settings, friday, evening, friday.minusDays(1), 0, 1))
    }
}
