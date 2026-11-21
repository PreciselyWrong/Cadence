package ch.nicolab.cadence.tasks.calendarfeeds

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CalendarFeedsTest {
    @Test
    fun `parseFeedsList parses feeds and visibility`() {
        val raw = """
            {
              "feeds": [
                {
                  "uid": "f1",
                  "name": "Équipe",
                  "url_host": "calendar.example.com",
                  "color": "#3b82f6",
                  "show_on_calendar": true
                },
                {
                  "uid": "f2",
                  "name": "Jours fériés",
                  "url_host": "ics.example.com",
                  "color": null,
                  "show_on_calendar": false
                }
              ]
            }
        """.trimIndent()
        val feeds = CalendarFeedsClient.parseFeedsList(Json.parseToJsonElement(raw).jsonObject)
        assertEquals(2, feeds.size)
        assertEquals("f1", feeds[0].uid)
        assertEquals("Équipe", feeds[0].name)
        assertEquals("#3b82f6", feeds[0].color)
        assertTrue(feeds[0].showOnCalendar)
        assertFalse(feeds[1].showOnCalendar)
        assertNull(feeds[1].color)
    }

    @Test
    fun `parseFeedEvents parses timed and all-day events including google feeds`() {
        val raw = """
            {
              "start": "2026-11-21",
              "end": "2026-11-22",
              "events": [
                {
                  "uid": "ev1",
                  "title": "Point hebdo",
                  "all_day": false,
                  "busy": true,
                  "date": "2026-11-21",
                  "start": "2026-11-21T09:00:00.000Z",
                  "end": "2026-11-21T10:00:00.000Z",
                  "start_minute": 600,
                  "end_minute": 660,
                  "feed_uid": "f1",
                  "feed_name": "Équipe",
                  "color": "#3b82f6",
                  "location": "Salle A",
                  "description": "Ordre du jour"
                },
                {
                  "uid": "ev2",
                  "title": "Congé",
                  "all_day": true,
                  "busy": false,
                  "date": "2026-11-22",
                  "start": "2026-11-22",
                  "end": "2026-11-23",
                  "start_minute": null,
                  "end_minute": null,
                  "feed_uid": "google-cal1",
                  "feed_name": "Perso",
                  "source": "google"
                }
              ]
            }
        """.trimIndent()
        val events = CalendarFeedsClient.parseFeedEvents(Json.parseToJsonElement(raw).jsonObject)
        assertEquals(2, events.size)
        assertEquals(600, events[0].startMinute)
        assertEquals("Salle A", events[0].location)
        assertEquals("google-cal1", events[1].feedUid)
        assertTrue(events[1].allDay)
    }

    @Test
    fun `visibleEvents filters hidden ICS feeds and hidden Google calendars`() {
        val feeds = listOf(
            CalendarFeed(uid = "f1", name = "A", showOnCalendar = true),
            CalendarFeed(uid = "f2", name = "B", showOnCalendar = false),
        )
        val events = listOf(
            FeedEvent("1", "Shown ICS", false, true, "2026-11-21", "", "", 60, 120, "f1", "A"),
            FeedEvent("2", "Hidden ICS", false, true, "2026-11-21", "", "", 60, 120, "f2", "B"),
            FeedEvent("3", "Shown Google", false, true, "2026-11-21", "", "", 60, 120, "google-g1", "G1", source = "google"),
            FeedEvent("4", "Hidden Google", false, true, "2026-11-21", "", "", 60, 120, "google-g2", "G2", source = "google"),
        )
        val visible = CalendarFeedsClient.visibleEvents(events, feeds, googleShown = setOf("google-g1"))
        assertEquals(listOf("1", "3"), visible.map { it.uid })
    }

    @Test
    fun `parseHexColor parses #rrggbb and falls back on invalid`() {
        assertEquals(0xFF3B82F6.toInt(), CalendarFeedsClient.parseHexColor("#3b82f6", 0xFF000000.toInt()))
        assertEquals(0xFF123456.toInt(), CalendarFeedsClient.parseHexColor("bad", 0xFF123456.toInt()))
    }
}
