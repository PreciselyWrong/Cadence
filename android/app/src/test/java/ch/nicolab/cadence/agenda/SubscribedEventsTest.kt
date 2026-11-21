package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.tasks.calendarfeeds.FeedEvent
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SubscribedEventsTest {
    private val paris = ZoneId.of("Europe/Paris")
    private val defaultColor = 0xFF64748B.toInt()

    @Test
    fun `maps all-day event to midnight-to-next-midnight on its date`() {
        val event = FeedEvent(
            uid = "all-1",
            title = "Férié",
            allDay = true,
            busy = false,
            date = "2026-11-21",
            start = "2026-11-21",
            end = "2026-11-22",
            feedUid = "feed-1",
            feedName = "Jours fériés",
            color = "#10b981",
        )
        val entry = mapFeedEventToAgendaEntry(event, paris, defaultColor)
        assertNotNull(entry)
        entry!!
        assertTrue(entry.allDay)
        assertTrue(entry.readOnly)
        assertEquals(LocalDateTime.of(2026, 11, 21, 0, 0), entry.start)
        assertEquals(LocalDateTime.of(2026, 11, 22, 0, 0), entry.end)
        assertEquals(0xFF10B981.toInt(), entry.colorArgb)
        assertEquals("Jours fériés", entry.calendarName)
    }

    @Test
    fun `maps multi-day timed event clipped to each day using wall minutes`() {
        val day1 = FeedEvent(
            uid = "multi-1",
            title = "Déplacement",
            allDay = false,
            busy = true,
            date = "2026-11-21",
            start = "2026-11-21T21:00:00.000Z",
            end = "2026-11-22T08:00:00.000Z",
            startMinute = 22 * 60,
            endMinute = 24 * 60,
            feedUid = "feed-1",
            feedName = "Pro",
        )
        val day2 = day1.copy(
            date = "2026-11-22",
            startMinute = 0,
            endMinute = 9 * 60,
        )
        val mapped = mapFeedEvents(listOf(day1, day2), paris, defaultColor)
        assertEquals(2, mapped.size)
        assertEquals(LocalDateTime.of(2026, 11, 21, 22, 0), mapped[0].start)
        assertEquals(LocalDateTime.of(2026, 11, 22, 0, 0), mapped[0].end)
        assertEquals(LocalDateTime.of(2026, 11, 22, 0, 0), mapped[1].start)
        assertEquals(LocalDateTime.of(2026, 11, 22, 9, 0), mapped[1].end)
        assertTrue(mapped[0].stableId != mapped[1].stableId)
    }

    @Test
    fun `falls back to ISO timestamps converted to local timezone when minutes are absent`() {
        val tokyo = ZoneId.of("Asia/Tokyo") // UTC+9
        val event = FeedEvent(
            uid = "tz-1",
            title = "Appel",
            allDay = false,
            busy = true,
            date = "2026-11-21",
            start = "2026-11-21T01:30:00Z",
            end = "2026-11-21T02:45:00+00:00",
            startMinute = null,
            endMinute = null,
            feedUid = "feed-1",
            feedName = "Équipe",
            location = "Visio",
            description = "Lien",
        )
        val entry = mapFeedEventToAgendaEntry(event, tokyo, defaultColor)!!
        assertEquals(LocalDateTime.of(2026, 11, 21, 10, 30), entry.start)
        assertEquals(LocalDateTime.of(2026, 11, 21, 11, 45), entry.end)
        assertEquals("Visio", entry.location)
        assertEquals("Lien", entry.description)
    }

    @Test
    fun `returns null when date is invalid`() {
        val event = FeedEvent(
            uid = "bad",
            title = "X",
            allDay = false,
            busy = true,
            date = "not-a-date",
            start = "",
            end = "",
            feedUid = "feed-1",
            feedName = "F",
        )
        assertNull(mapFeedEventToAgendaEntry(event, paris, defaultColor))
    }
}
