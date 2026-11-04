package ch.nicolab.cadence.tasks.brief

import java.time.LocalTime
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EveningModeTest {
    private fun settings(json: String) = Json.parseToJsonElement(json) as JsonObject

    @Test
    fun withoutASettingTheReviewIsOnFromSixInTheEvening() {
        assertEquals(EveningSwitch(true, 18 * 60), EveningMode.switchOf(null))
        assertEquals(EveningSwitch(true, 18 * 60), EveningMode.switchOf(settings("""{"time":"07:00"}""")))
        assertFalse(EveningMode.due(null, LocalTime.of(17, 59)))
        assertTrue(EveningMode.due(null, LocalTime.of(18, 0)))
        assertTrue(EveningMode.due(null, LocalTime.of(23, 55)))
    }

    @Test
    fun readsTheServersNormalizedSetting() {
        val current = settings("""{"evening":{"enabled":true,"switchTime":"19:30"}}""")

        assertEquals(EveningSwitch(true, 19 * 60 + 30), EveningMode.switchOf(current))
        assertFalse(EveningMode.due(current, LocalTime.of(19, 29)))
        assertTrue(EveningMode.due(current, LocalTime.of(19, 30)))
    }

    @Test
    fun disabledKeepsTheMorningBriefAllDay() {
        val current = settings("""{"evening":{"enabled":false,"switchTime":"18:00"}}""")

        assertFalse(EveningMode.due(current, LocalTime.of(22, 0)))
    }

    @Test
    fun anUnreadableTimeFallsBackToTheDefault() {
        assertEquals(18 * 60, EveningMode.switchOf(settings("""{"evening":{"enabled":true,"switchTime":"soir"}}""")).switchMinute)
    }

    @Test
    fun theViewFollowsTheClockButNeverShowsWhatIsMissing() {
        assertEquals(BriefView.EVENING, EveningMode.view(due = true, hasEvening = true, hasMorning = true, forcedMorning = false))
        assertEquals(BriefView.MORNING, EveningMode.view(due = true, hasEvening = true, hasMorning = true, forcedMorning = true))
        assertEquals(BriefView.MORNING, EveningMode.view(due = false, hasEvening = true, hasMorning = true, forcedMorning = false))
        // Pas encore lu (hors ligne, route absente) : le matin reste.
        assertEquals(BriefView.MORNING, EveningMode.view(due = true, hasEvening = false, hasMorning = true, forcedMorning = false))
        // Pas de résumé du matin : le bilan s'affiche même quand on a demandé le matin.
        assertEquals(BriefView.EVENING, EveningMode.view(due = true, hasEvening = true, hasMorning = false, forcedMorning = true))
    }

    @Test
    fun writingTheSwitchKeepsBothKeysAndTheRestOfTheSettings() {
        val current = settings("""{"time":"07:00","evening":{"enabled":true,"switchTime":"18:00"}}""")

        val next = EveningMode.withSwitch(current, EveningSwitch(enabled = false, switchMinute = 20 * 60 + 5))

        assertEquals("07:00", BriefSettingsJson.string(next, "time"))
        val group = BriefSettingsJson.group(next, "evening")
        assertEquals("false", group["enabled"].toString())
        assertEquals("\"20:05\"", group["switchTime"].toString())
        assertEquals(EveningSwitch(false, 20 * 60 + 5), EveningMode.switchOf(next))
    }

    @Test
    fun timesFollowTheServersFiveMinuteSteps() {
        assertEquals(18 * 60, EveningMode.parseMinute("18:00"))
        assertEquals(23 * 60 + 55, EveningMode.parseMinute("23:55"))
        assertNull(EveningMode.parseMinute("18:03"))
        assertNull(EveningMode.parseMinute("24:00"))
        assertNull(EveningMode.parseMinute("18h"))
        assertNull(EveningMode.parseMinute(null))
        assertEquals("07:05", EveningMode.clock(7 * 60 + 5))
    }
}
