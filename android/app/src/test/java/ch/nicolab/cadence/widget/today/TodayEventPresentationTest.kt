package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import java.time.Instant
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TodayEventPresentationTest {
    private val zone = ZoneOffset.UTC
    private val now = Instant.parse("2026-10-30T10:00:00Z")
    private val calendar = DeviceCalendar(1, "moi", "local", "Perso", 0xFF1E88E5.toInt(), true)

    private fun event(start: String, end: String, allDay: Boolean = false, done: Boolean = false) = EventWithDone(
        event = CalendarEvent(
            calendarId = 1,
            eventId = 1,
            instanceBegin = Instant.parse(start).toEpochMilli(),
            instanceEnd = Instant.parse(end).toEpochMilli(),
            allDay = allDay,
            title = "RDV",
            location = null,
            colorArgb = 0xFF1E88E5.toInt(),
        ),
        calendar = calendar,
        done = done,
    )

    @Test
    fun `un evenement a heure montre sa plage de debut et de fin`() {
        val label = TodayEventPresentation.timeLabel(event("2026-10-30T14:30:00Z", "2026-10-30T15:30:00Z").event, zone, "Journée")

        assertEquals("14:30–15:30", label)
    }

    @Test
    fun `un evenement sans duree ne montre que son debut`() {
        val label = TodayEventPresentation.timeLabel(event("2026-10-30T14:30:00Z", "2026-10-30T14:30:00Z").event, zone, "Journée")

        assertEquals("14:30", label)
    }

    @Test
    fun `une journee entiere montre le libelle journee`() {
        val label = TodayEventPresentation.timeLabel(event("2026-10-30T00:00:00Z", "2026-10-31T00:00:00Z", allDay = true).event, zone, "Journée")

        assertEquals("Journée", label)
    }

    @Test
    fun `l'etat distingue a venir, en cours et passe`() {
        assertEquals(TodayEventState.UPCOMING, TodayEventPresentation.state(event("2026-10-30T11:00:00Z", "2026-10-30T12:00:00Z"), now, zone))
        assertEquals(TodayEventState.ONGOING, TodayEventPresentation.state(event("2026-10-30T09:30:00Z", "2026-10-30T10:30:00Z"), now, zone))
        assertEquals(TodayEventState.PAST, TodayEventPresentation.state(event("2026-10-30T08:00:00Z", "2026-10-30T09:00:00Z"), now, zone))
    }

    @Test
    fun `un evenement fait l'emporte sur son horaire`() {
        assertEquals(TodayEventState.DONE, TodayEventPresentation.state(event("2026-10-30T11:00:00Z", "2026-10-30T12:00:00Z", done = true), now, zone))
    }

    @Test
    fun `une journee entiere du jour est en cours`() {
        val allDay = event("2026-10-30T00:00:00Z", "2026-10-31T00:00:00Z", allDay = true)

        assertEquals(TodayEventState.ONGOING, TodayEventPresentation.state(allDay, now, zone))
    }
}
