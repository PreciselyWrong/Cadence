package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AgendaLayoutTest {

    private val day = LocalDate.of(2026, 10, 30)
    private val zone = ZoneId.of("Europe/Zurich")

    private fun at(time: String): LocalDateTime = LocalDateTime.parse("2026-10-30T$time")

    private fun timed(
        title: String,
        start: String,
        end: String,
        done: Boolean = false,
    ) = AgendaEntry.Event(
        eventKey = EventInstanceKey(1, title.hashCode().toLong(), 0),
        calendarName = "Travail",
        title = title,
        start = at(start),
        end = at(end),
        allDay = false,
        done = done,
        colorArgb = 0xFF1E6FD9.toInt(),
    )

    private fun allDayEvent(title: String, from: LocalDate, untilExclusive: LocalDate) = AgendaEntry.Event(
        eventKey = EventInstanceKey(1, title.hashCode().toLong(), 0),
        calendarName = "Famille",
        title = title,
        start = from.atStartOfDay(),
        end = untilExclusive.atStartOfDay(),
        allDay = true,
        done = false,
        colorArgb = 0xFFE0483B.toInt(),
    )

    private fun task(title: String, start: String, end: String = start) = AgendaEntry.Task(
        uid = title,
        title = title,
        start = at(start),
        end = at(end),
        allDay = false,
        done = false,
        colorArgb = null,
    )

    @Test
    fun `overlapping timed entries take side-by-side columns`() {
        val layout = layoutDay(
            listOf(timed("A", "09:00", "10:00"), timed("B", "09:30", "11:00")),
            day,
        )

        val byTitle = layout.timed.associateBy { it.entry.title }
        assertEquals(0, byTitle.getValue("A").column)
        assertEquals(1, byTitle.getValue("B").column)
        assertEquals(2, byTitle.getValue("A").columnCount)
        assertEquals(2, byTitle.getValue("B").columnCount)
    }

    @Test
    fun `a chain of overlaps shares one cluster and reuses freed columns`() {
        val layout = layoutDay(
            listOf(
                timed("A", "09:00", "10:00"),
                timed("B", "09:30", "11:00"),
                timed("C", "10:30", "12:00"),
                timed("D", "13:00", "14:00"),
            ),
            day,
        )

        val byTitle = layout.timed.associateBy { it.entry.title }
        assertEquals(0, byTitle.getValue("A").column)
        assertEquals(1, byTitle.getValue("B").column)
        assertEquals(0, byTitle.getValue("C").column)
        assertEquals(2, byTitle.getValue("C").columnCount)
        assertEquals(1, byTitle.getValue("D").columnCount)
    }

    @Test
    fun `a zero-length entry keeps a minimum visual height of 30 minutes`() {
        val layout = layoutDay(listOf(task("Appel", "09:00")), day)

        val block = layout.timed.single()
        assertEquals(540, block.startMinute)
        assertEquals(570, block.endMinute)
    }

    @Test
    fun `all-day events and tasks without time stay out of the hour grid`() {
        val holiday = allDayEvent("Pont", day, day.plusDays(1))
        val untimedTask = AgendaEntry.Task(
            uid = "t",
            title = "Payer",
            start = day.atStartOfDay(),
            end = day.plusDays(1).atStartOfDay(),
            allDay = true,
            done = false,
            colorArgb = null,
        )

        val layout = layoutDay(listOf(untimedTask, holiday, timed("Réunion", "10:00", "11:00")), day)

        assertEquals(listOf("Payer", "Pont"), layout.allDay.map { it.title })
        assertEquals(listOf("Réunion"), layout.timed.map { it.entry.title })
    }

    @Test
    fun `an entry crossing midnight is clamped to each day`() {
        val night = timed("Veille", "23:00", "01:00").copy(end = LocalDateTime.parse("2026-10-31T01:00"))

        val first = layoutDay(listOf(night), day).timed.single()
        val second = layoutDay(listOf(night), day.plusDays(1)).timed.single()

        assertEquals(1380, first.startMinute)
        assertEquals(1440, first.endMinute)
        assertEquals(0, second.startMinute)
        assertEquals(60, second.endMinute)
    }

    @Test
    fun `an entry ending exactly at midnight does not belong to the next day`() {
        val untilMidnight = timed("Nuit", "22:00", "00:00").copy(end = LocalDateTime.parse("2026-10-31T00:00"))

        assertEquals(1, layoutDay(listOf(untilMidnight), day).timed.size)
        assertEquals(0, layoutDay(listOf(untilMidnight), day.plusDays(1)).timed.size)
    }

    @Test
    fun `a multi-day all-day entry appears on each day it covers`() {
        val trip = allDayEvent("Zermatt", LocalDate.of(2026, 10, 29), LocalDate.of(2026, 11, 2))
        val entries = listOf(trip)

        assertEquals(1, layoutDay(entries, LocalDate.of(2026, 10, 29)).allDay.size)
        assertEquals(1, layoutDay(entries, LocalDate.of(2026, 11, 1)).allDay.size)
        assertEquals(0, layoutDay(entries, LocalDate.of(2026, 11, 2)).allDay.size)
    }

    @Test
    fun `month grid starts on the Monday of the first week`() {
        val grid = monthGrid(YearMonth.of(2026, 6))

        assertEquals(LocalDate.of(2026, 6, 1), grid.first())
        assertEquals(35, grid.size)
        assertEquals(DayOfWeek.MONDAY, grid.first().dayOfWeek)
    }

    @Test
    fun `month grid uses six rows when the month needs them`() {
        val grid = monthGrid(YearMonth.of(2026, 8))

        assertEquals(42, grid.size)
        assertEquals(LocalDate.of(2026, 7, 27), grid.first())
        assertEquals(LocalDate.of(2026, 9, 6), grid.last())
    }

    @Test
    fun `week days run Monday to Sunday around the selected day`() {
        val week = weekDays(LocalDate.of(2026, 10, 30))

        assertEquals(LocalDate.of(2026, 10, 26), week.first())
        assertEquals(LocalDate.of(2026, 11, 1), week.last())
        assertEquals(7, week.size)
    }

    @Test
    fun `dots show at most three entries per day and cover multi-day entries`() {
        val entries = listOf(
            timed("A", "09:00", "10:00"),
            timed("B", "11:00", "12:00"),
            timed("C", "13:00", "14:00"),
            timed("D", "15:00", "16:00"),
            allDayEvent("Zermatt", day, day.plusDays(2)),
        )

        val dots = dotsByDay(entries)

        assertEquals(3, dots.getValue(day).size)
        assertEquals(1, dots.getValue(day.plusDays(1)).size)
        assertEquals(null, dots[day.plusDays(2)])
    }

    @Test
    fun `list groups are sorted by date and drop empty days`() {
        val entries = listOf(
            timed("Plus tard", "10:00", "11:00").copy(
                start = LocalDateTime.parse("2026-11-02T10:00"),
                end = LocalDateTime.parse("2026-11-02T11:00"),
            ),
            timed("Avant", "08:00", "09:00").copy(
                start = LocalDateTime.parse("2026-10-29T08:00"),
                end = LocalDateTime.parse("2026-10-29T09:00"),
            ),
            timed("Hors plage", "08:00", "09:00").copy(
                start = LocalDateTime.parse("2026-10-20T08:00"),
                end = LocalDateTime.parse("2026-10-20T09:00"),
            ),
            allDayEvent("Pont", LocalDate.of(2026, 10, 30), LocalDate.of(2026, 10, 31)),
            timed("Réunion", "09:30", "10:00").copy(
                start = LocalDateTime.parse("2026-10-30T09:30"),
                end = LocalDateTime.parse("2026-10-30T10:00"),
            ),
        )

        val groups = listGroups(entries, from = LocalDate.of(2026, 10, 28), days = 30)

        assertEquals(
            listOf(LocalDate.of(2026, 10, 29), LocalDate.of(2026, 10, 30), LocalDate.of(2026, 11, 2)),
            groups.map { it.date },
        )
        assertEquals(listOf("Pont", "Réunion"), groups[1].entries.map { it.title })
    }

    @Test
    fun `a calendar event without its own colour takes the calendar colour`() {
        val calendar = DeviceCalendar(
            id = 7,
            accountName = "compte",
            accountType = "com.google",
            displayName = "Travail",
            colorArgb = 0xFF2E7D32.toInt(),
            visibleOnDevice = true,
        )
        val start = Instant.parse("2026-10-30T08:00:00Z").toEpochMilli()
        val event = CalendarEvent(
            calendarId = 7,
            eventId = 1,
            instanceBegin = start,
            instanceEnd = start + 3_600_000,
            allDay = false,
            title = "Réunion",
            location = null,
            colorArgb = 0,
        )

        val entry = agendaEvent(EventWithDone(event, calendar, done = false), zone)

        assertEquals(0xFF2E7D32.toInt(), entry.colorArgb)
        assertEquals(LocalDateTime.of(2026, 10, 30, 9, 0), entry.start)
        assertEquals(LocalDateTime.of(2026, 10, 30, 10, 0), entry.end)
    }

    @Test
    fun `a dated task becomes a timed or all-day entry by its due time`() {
        val timedDue = Instant.parse("2026-10-30T13:30:00Z")
        val withTime = TaskItem(uid = "a", name = "Appel", dueDate = timedDue, dueHasTime = true)
        val withoutTime = TaskItem(
            uid = "b",
            name = "Payer",
            dueDate = Instant.parse("2026-10-30T21:59:59Z"),
            dueDay = day,
            status = TaskStatus.DONE,
        )
        val undated = TaskItem(uid = "c", name = "Un jour")

        val timedEntry = agendaTask(withTime, projectColorArgb = 0xFFC77700.toInt(), zone = zone)
        val dayEntry = agendaTask(withoutTime, projectColorArgb = null, zone = zone)

        assertEquals(LocalDateTime.of(2026, 10, 30, 14, 30), timedEntry?.start)
        assertEquals(false, timedEntry?.allDay)
        assertEquals(0xFFC77700.toInt(), timedEntry?.colorArgb)
        assertEquals(LocalDateTime.of(2026, 10, 30, 0, 0), dayEntry?.start)
        assertEquals(LocalDateTime.of(2026, 10, 31, 0, 0), dayEntry?.end)
        assertEquals(true, dayEntry?.allDay)
        assertEquals(true, dayEntry?.done)
        assertNull(agendaTask(undated, projectColorArgb = null, zone = zone))
    }

    @Test
    fun `a project colour is read only from a hex string`() {
        assertEquals(0xFF2E7D32.toInt(), parseProjectColor("#2E7D32"))
        assertEquals(0xFF2E7D32.toInt(), parseProjectColor("2E7D32"))
        assertNull(parseProjectColor("vert"))
        assertNull(parseProjectColor(null))
    }

    @Test
    fun `an untimed task turned into an all-day entry spans its whole day`() {
        val block = task("Dans la journée", "09:00", "09:00").withoutTime()

        assertEquals(true, block.allDay)
        assertEquals(LocalDateTime.of(2026, 10, 30, 0, 0), block.start)
        assertEquals(LocalDateTime.of(2026, 10, 31, 0, 0), block.end)
    }

    @Test
    fun `utc offset does not shift an all-day event off its civil day`() {
        val utcMidnight = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val event = CalendarEvent(
            calendarId = 1,
            eventId = 2,
            instanceBegin = utcMidnight,
            instanceEnd = utcMidnight + 86_400_000,
            allDay = true,
            title = "Fête",
            location = null,
            colorArgb = 0xFF2E7D32.toInt(),
        )
        val calendar = DeviceCalendar(1, "a", "b", "c", 0, true)

        val entry = agendaEvent(EventWithDone(event, calendar, done = false), zone)

        assertEquals(day.atStartOfDay(), entry.start)
        assertEquals(day.plusDays(1).atStartOfDay(), entry.end)
    }
}
