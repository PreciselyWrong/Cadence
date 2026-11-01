package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.ui.TodayItem
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodaySizeTest {
    @Test
    fun `une case pleine ou plus garde la mise en page complete`() {
        assertEquals(TodaySizeClass.FULL, TodaySize.classOf(180f, 180f))
        assertEquals(TodaySizeClass.FULL, TodaySize.classOf(250f, 260f))
    }

    @Test
    fun `un 2x2 ou un 2x1 passe en mise en page compacte, dans les deux sens`() {
        assertEquals(TodaySizeClass.COMPACT, TodaySize.classOf(146f, 146f))
        assertEquals(TodaySizeClass.COMPACT, TodaySize.classOf(250f, 110f))
        assertEquals(TodaySizeClass.COMPACT, TodaySize.classOf(110f, 250f))
        assertEquals(TodaySizeClass.COMPACT, TodaySize.classOf(179.5f, 400f))
    }

    @Test
    fun `l'element suivant est le premier retard, puis la premiere tache du jour`() {
        val late = task("late", today.minusDays(2))
        val now = task("now", today)
        val selection = selection(overdue = listOf(late), tasks = listOf(now))

        assertEquals(TodayItem.Task(late), TodayCompactNext.of(selection, zone))
        assertEquals(TodayItem.Task(now), TodayCompactNext.of(selection.copy(overdue = emptyList()), zone))
    }

    @Test
    fun `sans tache, l'element suivant est le premier evenement du jour`() {
        val meeting = event("Point", at("09:00"))

        val next = TodayCompactNext.of(selection(events = listOf(meeting)), zone)

        assertEquals(TodayItem.Event(meeting), next)
    }

    @Test
    fun `rien a montrer donne aucun element suivant`() {
        assertNull(TodayCompactNext.of(selection(), zone))
    }

    private val today = LocalDate.of(2026, 10, 30)
    private val zone = ZoneOffset.UTC

    private fun selection(
        overdue: List<TaskItem> = emptyList(),
        tasks: List<TaskItem> = emptyList(),
        events: List<EventWithDone> = emptyList(),
    ) = TodaySelection(
        total = overdue.size + tasks.size,
        overdueTotal = overdue.size,
        overdue = overdue,
        tasks = tasks,
        events = events,
    )

    private fun task(uid: String, due: LocalDate) = TaskItem(
        uid = uid,
        name = uid,
        dueDay = due,
        dueDate = due.atStartOfDay(zone).toInstant(),
    )

    private fun at(hhmm: String): Long = today.atTime(java.time.LocalTime.parse(hhmm)).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun event(title: String, begin: Long) = EventWithDone(
        event = CalendarEvent(
            calendarId = 1L,
            eventId = title.hashCode().toLong(),
            instanceBegin = begin,
            instanceEnd = begin + 3_600_000L,
            allDay = false,
            title = title,
            location = null,
            colorArgb = 0xFF00AA00.toInt(),
        ),
        calendar = DeviceCalendar(1L, "compte", "local", "Agenda", 0xFF00AA00.toInt(), true),
        done = false,
    )
}
