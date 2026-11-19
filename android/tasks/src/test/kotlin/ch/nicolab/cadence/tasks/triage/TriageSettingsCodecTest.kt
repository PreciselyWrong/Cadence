package ch.nicolab.cadence.tasks.triage

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TriageSettingsCodecTest {
    @Test
    fun parseAndSerialize_roundTripsAllFields() {
        val raw = Json.parseToJsonElement(
            """
            {
              "calendarFeedUids": ["cal-1", "cal-2"],
              "calendarLookaheadDays": 10,
              "thresholds": {
                "postponements": 5,
                "duplicateSimilarity": 0.75,
                "closedLookbackDays": 14
              },
              "alerts": {
                "disabled": ["duplicate", "unknown_ignored"]
              },
              "triage": {
                "enabled": true,
                "dailyLimit": 40
              }
            }
            """.trimIndent(),
        ).jsonObject

        val parsed = TriageSettingsCodec.parse(raw)
        assertEquals(listOf("cal-1", "cal-2"), parsed.calendarFeedUids)
        assertEquals(10, parsed.calendarLookaheadDays)
        assertEquals(5, parsed.postponements)
        assertEquals(0.75, parsed.duplicateSimilarity, 0.0001)
        assertEquals(14, parsed.closedLookbackDays)
        assertEquals(setOf("duplicate"), parsed.disabledAlerts)
        assertTrue(parsed.aiEnabled)
        assertEquals(40, parsed.aiDailyLimit)

        val putBody = TriageSettingsCodec.toPutBody(parsed)
        assertEquals(parsed, TriageSettingsCodec.parse(putBody))
    }

    @Test
    fun parseCalendars_readsFeedsAndGoogleCalendars() {
        val feeds = Json.parseToJsonElement("""{"feeds":[{"uid":"f1","name":"Perso"}]}""").jsonObject
        val google = Json.parseToJsonElement("""{"calendars":[{"feed_uid":"g1","name":"Travail"}]}""").jsonObject

        assertEquals(listOf(TriageCalendarOption("f1", "Perso")), TriageSettingsCodec.parseCalendarFeeds(feeds))
        assertEquals(listOf(TriageCalendarOption("g1", "Travail")), TriageSettingsCodec.parseGoogleCalendars(google))
    }
}
