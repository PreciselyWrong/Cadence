package ch.nicolab.cadence.calendar

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

class EventSelectionTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val day = LocalDate.of(2026, 10, 30)
    private val range = TimeRange.ofDays(day, 1, zone)
    private val defaults = CalendarGlobalSettings()
    private val calendar = calendar(id = 1L)

    private fun calendar(id: Long, account: String = "compte", name: String = "Agenda $id") = DeviceCalendar(
        id = id,
        accountName = account,
        accountType = "com.google",
        displayName = name,
        colorArgb = 0,
        visibleOnDevice = true,
    )

    private fun at(hour: Int, date: LocalDate = day): Long =
        date.atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()

    private fun event(
        eventId: Long = 1L,
        calendarId: Long = 1L,
        begin: Long = at(10),
        end: Long = begin + 3_600_000L,
        allDay: Boolean = false,
        title: String = "Réunion",
    ) = CalendarEvent(
        calendarId = calendarId,
        eventId = eventId,
        instanceBegin = begin,
        instanceEnd = end,
        allDay = allDay,
        title = title,
        location = null,
        colorArgb = 0,
    )

    private fun select(
        events: List<CalendarEvent>,
        calendars: List<DeviceCalendar> = listOf(calendar),
        displays: Map<Long, CalendarDisplay> = emptyMap(),
        global: CalendarGlobalSettings = defaults,
        done: Set<EventInstanceKey> = emptySet(),
        surface: CalendarSurface = CalendarSurface.AGENDA,
    ): List<EventWithDone> = selectEvents(events, calendars, displays, global, done, range, surface, zone)

    @Test
    fun `un agenda sans réglage s'affiche sur l'agenda et les tâches, pas sur le widget`() {
        val events = listOf(event())

        assertEquals(1, select(events, surface = CalendarSurface.AGENDA).size)
        assertEquals(1, select(events, surface = CalendarSurface.TASKS).size)
        assertEquals(0, select(events, surface = CalendarSurface.WIDGET).size)
    }

    @Test
    fun `un réglage enregistré masque l'agenda sur la surface désactivée`() {
        val displays = mapOf(1L to CalendarDisplay(agenda = false))
        val events = listOf(event())

        assertEquals(0, select(events, displays = displays, surface = CalendarSurface.AGENDA).size)
        assertEquals(1, select(events, displays = displays, surface = CalendarSurface.TASKS).size)
    }

    @Test
    fun `une occurrence d'un agenda inconnu est écartée`() {
        val events = listOf(event(calendarId = 99L))

        assertEquals(emptyList<EventWithDone>(), select(events))
    }

    @Test
    fun `une occurrence hors de la plage est écartée`() {
        val tomorrow = event(begin = at(10, day.plusDays(1)))

        assertEquals(emptyList<EventWithDone>(), select(listOf(tomorrow)))
    }

    @Test
    fun `l'état fait vient de l'ensemble des faites`() {
        val done = event(eventId = 1L)
        val pending = event(eventId = 2L)

        val result = select(listOf(done, pending), done = setOf(done.key))

        assertEquals(mapOf(1L to true, 2L to false), result.associate { it.event.eventId to it.done })
    }

    @Test
    fun `sans cocher les événements, aucune occurrence n'est faite ni masquée`() {
        val event = event()
        val global = CalendarGlobalSettings(checkEvents = false, hideDone = true)

        val result = select(listOf(event), global = global, done = setOf(event.key))

        assertEquals(1, result.size)
        assertFalse(result.single().done)
    }

    @Test
    fun `masquer les faites retire les occurrences faites`() {
        val done = event(eventId = 1L)
        val pending = event(eventId = 2L)
        val global = CalendarGlobalSettings(hideDone = true)

        val result = select(listOf(done, pending), global = global, done = setOf(done.key))

        assertEquals(listOf(2L), result.map { it.event.eventId })
    }

    @Test
    fun `les doublons de même clé n'apparaissent qu'une fois`() {
        val result = select(listOf(event(), event()))

        assertEquals(1, result.size)
    }

    @Test
    fun `tri par journée entière d'abord, puis début, puis titre sans casse`() {
        val events = listOf(
            event(eventId = 1L, begin = at(10), title = "beta"),
            event(eventId = 2L, begin = at(8), title = "gamma"),
            event(eventId = 3L, begin = at(10), title = "Alpha"),
            event(
                eventId = 4L,
                begin = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                end = day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                allDay = true,
                title = "Zeta",
            ),
        )

        val titles = select(events).map { it.event.title }

        assertEquals(listOf("Zeta", "gamma", "Alpha", "beta"), titles)
    }

    @Test
    fun `withDisplays trie par compte puis nom sans casse et applique les défauts`() {
        val calendars = listOf(
            calendar(id = 1L, account = "b", name = "Travail"),
            calendar(id = 2L, account = "a", name = "zeta"),
            calendar(id = 3L, account = "a", name = "Alpha"),
        )
        val displays = mapOf(2L to CalendarDisplay(agenda = false, tasks = false, widget = true))

        val result = withDisplays(calendars, displays)

        assertEquals(listOf(3L, 2L, 1L), result.map { it.calendar.id })
        assertEquals(CalendarDisplay(), result.first { it.calendar.id == 3L }.display)
        assertEquals(CalendarDisplay(agenda = false, tasks = false, widget = true), result.first { it.calendar.id == 2L }.display)
    }
}
