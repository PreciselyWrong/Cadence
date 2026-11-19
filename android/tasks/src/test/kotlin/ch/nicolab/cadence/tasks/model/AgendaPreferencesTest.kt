package ch.nicolab.cadence.tasks.model

import ch.nicolab.cadence.tasks.sync.profileOf
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AgendaPreferencesTest {
    @Test
    fun visibleHours_defaultsToWholeDayWhenMissingOrInvalid() {
        assertEquals(VisibleHours.WHOLE_DAY, VisibleHours.fromUiSettings(null))
        assertEquals(VisibleHours.WHOLE_DAY, VisibleHours.of(null, 18))
        assertEquals(VisibleHours.WHOLE_DAY, VisibleHours.of(8, 8))
        assertEquals(VisibleHours.WHOLE_DAY, VisibleHours.of(20, 8))
        assertEquals(VisibleHours.WHOLE_DAY, VisibleHours.of(-1, 18))
        assertEquals(VisibleHours.WHOLE_DAY, VisibleHours.of(8, 25))
    }

    @Test
    fun visibleHours_rejectsNonIntegerFromJson() {
        val ui = Json.parseToJsonElement("""{"calendar":{"visibleHours":{"start":8.5,"end":20}}}""").jsonObject
        assertEquals(VisibleHours.WHOLE_DAY, VisibleHours.fromUiSettings(ui))
    }

    @Test
    fun profileOf_readsVisibleHoursAndDayHoursFromUiSettings() {
        val raw = Json.parseToJsonElement(
            """
            {
              "email": "a@b.c",
              "ui_settings": {
                "calendar": { "visibleHours": { "start": 7, "end": 21 } },
                "planning": { "dayHours": { "start": 510, "end": 1050 } }
              }
            }
            """.trimIndent(),
        ).jsonObject
        val profile = profileOf(raw)
        assertEquals(VisibleHours(7, 21), profile.visibleHours)
        assertEquals(DayHoursRange(510, 1050), profile.dayHours)
    }

    @Test
    fun dayHoursRange_nullWhenInvalid() {
        assertNull(DayHoursRange.of(600, 600))
        assertNull(DayHoursRange.of(1000, 500))
        assertNull(DayHoursRange.of(-10, 500))
        assertNull(DayHoursRange.of(0, 1441))
    }
}
