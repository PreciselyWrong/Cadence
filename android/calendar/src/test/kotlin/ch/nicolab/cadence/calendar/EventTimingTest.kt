package ch.nicolab.cadence.calendar

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EventTimingTest {
    private val zurich = ZoneId.of("Europe/Zurich")
    private val day = LocalDate.of(2026, 10, 30)
    private val dayRange = TimeRange.ofDays(day, 1, zurich)

    private fun localMillis(date: LocalDate, hour: Int, zone: ZoneId = zurich): Long =
        date.atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()

    private fun timed(begin: Long, end: Long) = event(begin, end, allDay = false)

    private fun allDay(fromUtcDay: LocalDate, toUtcDayExclusive: LocalDate) = event(
        begin = fromUtcDay.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        end = toUtcDayExclusive.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        allDay = true,
    )

    private fun event(begin: Long, end: Long, allDay: Boolean) = CalendarEvent(
        calendarId = 1L,
        eventId = 1L,
        instanceBegin = begin,
        instanceEnd = end,
        allDay = allDay,
        title = "Événement",
        location = null,
        colorArgb = 0,
    )

    @Test
    fun `un événement qui finit au début de la plage n'y figure pas`() {
        val ends = timed(dayRange.startMillis - 3_600_000L, dayRange.startMillis)

        assertFalse(ends.overlaps(dayRange, zurich))
    }

    @Test
    fun `un événement qui commence à la fin de la plage n'y figure pas`() {
        val starts = timed(dayRange.endMillis, dayRange.endMillis + 3_600_000L)

        assertFalse(starts.overlaps(dayRange, zurich))
    }

    @Test
    fun `un événement à cheval sur minuit compte sur les deux jours`() {
        val nightly = timed(localMillis(day, 23), localMillis(day.plusDays(1), 1))

        assertTrue(nightly.overlaps(TimeRange.ofDays(day, 1, zurich), zurich))
        assertTrue(nightly.overlaps(TimeRange.ofDays(day.plusDays(1), 1, zurich), zurich))
    }

    @Test
    fun `un événement de durée nulle compte à l'ouverture et pas à la fin de la plage`() {
        val atStart = timed(dayRange.startMillis, dayRange.startMillis)
        val atEnd = timed(dayRange.endMillis, dayRange.endMillis)

        assertTrue(atStart.overlaps(dayRange, zurich))
        assertFalse(atEnd.overlaps(dayRange, zurich))
    }

    @Test
    fun `une journée entière reste sur son jour civil local dans chaque fuseau`() {
        val zones = listOf("Europe/Zurich", "America/New_York", "Pacific/Kiritimati").map(ZoneId::of)
        val event = allDay(LocalDate.of(2026, 10, 30), LocalDate.of(2026, 10, 31))

        zones.forEach { zone ->
            assertFalse(event.overlaps(TimeRange.ofDays(day.minusDays(1), 1, zone), zone), zone.toString())
            assertTrue(event.overlaps(TimeRange.ofDays(day, 1, zone), zone), zone.toString())
            assertFalse(event.overlaps(TimeRange.ofDays(day.plusDays(1), 1, zone), zone), zone.toString())
        }
    }

    @Test
    fun `une journée entière sur plusieurs jours couvre chacun de ses jours seulement`() {
        val zones = listOf("Europe/Zurich", "America/New_York", "Pacific/Kiritimati").map(ZoneId::of)
        val event = allDay(LocalDate.of(2026, 10, 30), LocalDate.of(2026, 11, 2))

        zones.forEach { zone ->
            val covered = (0..4).map { offset ->
                event.overlaps(TimeRange.ofDays(day.plusDays(offset.toLong()), 1, zone), zone)
            }
            assertEquals(listOf(true, true, true, false, false), covered, zone.toString())
        }
    }

    @Test
    fun `le début local d'une journée entière est minuit du jour civil`() {
        val event = allDay(LocalDate.of(2026, 10, 30), LocalDate.of(2026, 10, 31))

        assertEquals(localMillis(day, 0), event.localStart(zurich))
        assertEquals(localMillis(day.plusDays(1), 0), event.localEnd(zurich))
    }

    @Test
    fun `ofDays couvre une journée de 25 h le jour du passage à l'heure d'hiver`() {
        val range = TimeRange.ofDays(LocalDate.of(2026, 10, 25), 1, zurich)

        assertEquals(25 * 3_600_000L, range.endMillis - range.startMillis)
    }

    @Test
    fun `ofDays refuse un nombre de jours négatif`() {
        assertThrows(IllegalArgumentException::class.java) {
            TimeRange.ofDays(day, -1, zurich)
        }
    }

    @Test
    fun `une occurrence sans chevauchement hors de la plage reste exclue en fuseau UTC`() {
        val utc = ZoneId.of("UTC")
        val range = TimeRange.ofDays(day, 1, utc)
        val before = timed(Instant.parse("2026-10-29T23:59:59Z").toEpochMilli(), Instant.parse("2026-10-30T00:00:00Z").toEpochMilli())

        assertFalse(before.overlaps(range, utc))
    }
}
