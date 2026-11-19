package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.tasks.model.DayHoursRange
import ch.nicolab.cadence.tasks.model.VisibleHours
import java.time.LocalDateTime
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AgendaHoursTest {
    private fun event(id: Long, start: String, end: String) = AgendaEntry.Event(
        eventKey = EventInstanceKey(1, id, 0),
        calendarName = "Travail",
        title = "Événement",
        start = LocalDateTime.parse("2026-10-30T$start"),
        end = LocalDateTime.parse("2026-10-30T$end"),
        allDay = false,
        done = false,
        colorArgb = 0xFF1E6FD9.toInt(),
    )

    @Test
    fun effectiveVisibleHours_keepsConfiguredWhenNothingOutside() {
        val block = TimedBlock(
            entry = event(1, "09:00", "09:30"),
            startMinute = 9 * 60,
            endMinute = 9 * 60 + 30,
            column = 0,
            columnCount = 1,
        )
        val result = AgendaHours.effectiveVisibleHours(
            VisibleHours(8, 20),
            listOf(DayLayout(emptyList(), listOf(block))),
        )
        assertEquals(VisibleHours(8, 20), result)
    }

    @Test
    fun effectiveVisibleHours_widensForEarlyAndLateBlocks() {
        val early = TimedBlock(
            entry = event(1, "06:30", "07:15"),
            startMinute = 6 * 60 + 30,
            endMinute = 7 * 60 + 15,
            column = 0,
            columnCount = 1,
        )
        val late = TimedBlock(
            entry = event(2, "20:15", "20:45"),
            startMinute = 20 * 60 + 15,
            endMinute = 20 * 60 + 45,
            column = 0,
            columnCount = 1,
        )
        val result = AgendaHours.effectiveVisibleHours(
            VisibleHours(8, 20),
            listOf(DayLayout(emptyList(), listOf(early, late))),
        )
        assertEquals(VisibleHours(6, 21), result)
    }

    @Test
    fun offWorkBands_splitsBeforeAndAfterWithinVisibleWindow() {
        val bands = AgendaHours.offWorkBands(
            VisibleHours(7, 21),
            DayHoursRange(9 * 60, 18 * 60),
        )
        assertEquals(
            listOf(
                OffWorkBand(7 * 60, 9 * 60),
                OffWorkBand(18 * 60, 21 * 60),
            ),
            bands,
        )
    }

    @Test
    fun offWorkBands_emptyWhenWorkCoversVisibleWindow() {
        val bands = AgendaHours.offWorkBands(
            VisibleHours(9, 17),
            DayHoursRange(8 * 60, 18 * 60),
        )
        assertEquals(emptyList<OffWorkBand>(), bands)
    }

    @Test
    fun initialScrollHour_clampsToVisibleWindow() {
        assertEquals(
            8,
            AgendaHours.initialScrollHour(VisibleHours(8, 20), DayHoursRange(9 * 60, 18 * 60), LocalTime.of(6, 0), todayShown = true),
        )
        assertEquals(
            9,
            AgendaHours.initialScrollHour(VisibleHours(7, 20), DayHoursRange(9 * 60, 18 * 60), LocalTime.of(12, 0), todayShown = false),
        )
    }
}
