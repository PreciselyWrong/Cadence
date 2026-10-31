package ch.nicolab.cadence.calendar

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class EventDetailTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val calendar = DeviceCalendar(1L, "compte", "com.google", "Travail", colorArgb = 0xFF112233.toInt(), visibleOnDevice = true)

    @Test
    fun `la fiche d'un événement horaire est dans le fuseau local avec lieu et description`() {
        val begin = LocalDate.of(2026, 10, 30).atTime(10, 0).atZone(zone).toInstant().toEpochMilli()
        val event = CalendarEvent(1L, 9L, begin, begin + 3_600_000L, false, "Point", "Salle 2", 0, "Voir https://exemple.ch")

        val detail = EventWithDone(event, calendar, done = true).toDetail(zone)

        assertEquals(LocalDateTime.of(2026, 10, 30, 10, 0), detail.start)
        assertEquals(LocalDateTime.of(2026, 10, 30, 11, 0), detail.end)
        assertEquals("Salle 2", detail.location)
        assertEquals("Voir https://exemple.ch", detail.description)
        assertEquals(calendar.colorArgb, detail.colorArgb)
        assertEquals(true, detail.done)
        assertEquals(HiddenEvent(event.key, "Point", false), detail.toHidden())
    }

    @Test
    fun `une journée entière ancrée en UTC reste sur son jour civil local`() {
        val begin = LocalDate.of(2026, 10, 30).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val event = CalendarEvent(1L, 3L, begin, begin + 86_400_000L, true, "Férié", null, 0x00FF00)

        val detail = EventWithDone(event, calendar, done = false).toDetail(zone)

        assertEquals(LocalDateTime.of(2026, 10, 30, 0, 0), detail.start)
        assertEquals(LocalDateTime.of(2026, 10, 31, 0, 0), detail.end)
        assertEquals(0x00FF00, detail.colorArgb)
    }
}
