package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.calendar.CalendarEvent
import ch.nicolab.cadence.calendar.DeviceCalendar
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.HiddenEvent
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AgendaEventDetailTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val calendar = DeviceCalendar(2L, "compte", "com.google", "Perso", 0xFF445566.toInt(), true)

    private fun item(done: Boolean = false): EventWithDone {
        val begin = LocalDate.of(2026, 10, 30).atTime(9, 30).atZone(zone).toInstant().toEpochMilli()
        val event = CalendarEvent(2L, 11L, begin, begin + 1_800_000L, false, "Dentiste", "Rue du Lac 4", 0, "Apporter la carte")
        return EventWithDone(event, calendar, done)
    }

    @Test
    fun `l'entrée d'agenda garde lieu et description pour la fiche`() {
        val entry = agendaEvent(item(done = true), zone)

        assertEquals("Rue du Lac 4", entry.location)
        assertEquals("Apporter la carte", entry.description)

        val detail = entry.toDetail()
        assertEquals(entry.eventKey, detail.key)
        assertEquals("Perso", detail.calendarName)
        assertEquals(LocalDateTime.of(2026, 10, 30, 9, 30), detail.start)
        assertEquals(LocalDateTime.of(2026, 10, 30, 10, 0), detail.end)
        assertEquals(true, detail.done)
    }

    @Test
    fun `masquer une entrée vise la même occurrence que son événement source`() {
        val source = item()

        assertEquals(
            HiddenEvent(source.event.key, "Dentiste", allDay = false),
            agendaEvent(source, zone).toDetail().toHidden(),
        )
    }
}
