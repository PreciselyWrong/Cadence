package ch.nicolab.cadence.tasks.ui.brief

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class BriefFormatTest {
    private val today = LocalDate.of(2026, 11, 4)

    @Test
    fun longDateIsCapitalisedFrench() {
        assertEquals("Mercredi 4 novembre", BriefFormat.longDate(today))
    }

    @Test
    fun chipIsTheShortDayAndTheDayOfMonth() {
        assertEquals("Sam 7", BriefFormat.chip(LocalDate.of(2026, 11, 7)))
    }

    @Test
    fun todayHasNoDayNameSoTheCallerUsesItsResource() {
        assertNull(BriefFormat.dayTitle(today, today))
        assertEquals("Jeudi", BriefFormat.dayTitle(today.plusDays(1), today))
    }

    @Test
    fun durationSplitsIntoHoursAndMinutes() {
        assertEquals(0 to 40, BriefFormat.hoursAndMinutes(40))
        assertEquals(2 to 0, BriefFormat.hoursAndMinutes(120))
        assertEquals(1 to 10, BriefFormat.hoursAndMinutes(70))
    }

    @Test
    fun parsesClockTimesAndRejectsOthers() {
        assertEquals(18 * 60 + 30, BriefFormat.parseMinute("18:30"))
        assertEquals(null, BriefFormat.parseMinute("18h30"))
        assertEquals(null, BriefFormat.parseMinute("25:00"))
        assertEquals(null, BriefFormat.parseMinute(null))
    }

    @Test
    fun weekdayIndexZeroIsSunday() {
        assertEquals("Dimanche", BriefFormat.weekday(0))
        assertEquals("Lundi", BriefFormat.weekday(1))
        assertEquals("Samedi", BriefFormat.weekday(6))
    }

    @Test
    fun daysSinceNeverGoesNegative() {
        assertEquals(2, BriefFormat.daysSince(today.minusDays(2), today))
        assertEquals(0, BriefFormat.daysSince(today.plusDays(1), today))
    }
}
