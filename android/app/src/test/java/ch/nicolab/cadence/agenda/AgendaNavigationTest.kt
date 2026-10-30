package ch.nicolab.cadence.agenda

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AgendaNavigationTest {

    private val friday = LocalDate.of(2026, 10, 30)

    @Test
    fun `day view steps one day`() {
        assertEquals(friday.plusDays(1), stepDate(AgendaMode.DAY, friday, 1, weekends = true))
        assertEquals(friday.minusDays(1), stepDate(AgendaMode.DAY, friday, -1, weekends = true))
    }

    @Test
    fun `day view skips hidden weekends`() {
        assertEquals(LocalDate.of(2026, 11, 2), stepDate(AgendaMode.DAY, friday, 1, weekends = false))
        assertEquals(friday, stepDate(AgendaMode.DAY, LocalDate.of(2026, 11, 2), -1, weekends = false))
    }

    @Test
    fun `other views step by their span`() {
        assertEquals(friday.plusDays(3), stepDate(AgendaMode.THREE_DAYS, friday, 1, true))
        assertEquals(LocalDate.of(2026, 11, 30), stepDate(AgendaMode.MONTH, friday, 1, true))
        assertEquals(friday.minusDays(AGENDA_LIST_DAYS.toLong()), stepDate(AgendaMode.LIST, friday, -1, true))
    }

    @Test
    fun `three days skip hidden weekends`() {
        assertEquals(
            listOf(friday, LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 3)),
            threeDays(friday, weekends = false),
        )
        assertEquals(
            listOf(LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 4)),
            threeDays(LocalDate.of(2026, 10, 31), weekends = false),
        )
        assertEquals(List(3) { friday.plusDays(it.toLong()) }, threeDays(friday, weekends = true))
    }
}
