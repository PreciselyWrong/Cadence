package ch.nicolab.cadence.tasks.quickadd

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class QuickDatesTest {
    private val friday = LocalDate.of(2026, 10, 30)

    @Test
    fun `weekend is the coming saturday and skips to next week once started`() {
        assertEquals(LocalDate.of(2026, 10, 31), QuickDates.weekend(friday))
        assertEquals(LocalDate.of(2026, 11, 7), QuickDates.weekend(LocalDate.of(2026, 10, 31)))
        assertEquals(LocalDate.of(2026, 11, 7), QuickDates.weekend(LocalDate.of(2026, 11, 1)))
        assertEquals(LocalDate.of(2026, 11, 7), QuickDates.weekend(LocalDate.of(2026, 11, 2)))
    }

    @Test
    fun `next week is the following monday whatever the day`() {
        assertEquals(LocalDate.of(2026, 11, 2), QuickDates.nextWeek(friday))
        assertEquals(LocalDate.of(2026, 11, 2), QuickDates.nextWeek(LocalDate.of(2026, 10, 26)))
        assertEquals(LocalDate.of(2026, 11, 9), QuickDates.nextWeek(LocalDate.of(2026, 11, 2)))
        assertEquals(LocalDate.of(2026, 11, 2), QuickDates.nextWeek(LocalDate.of(2026, 11, 1)))
    }

    @Test
    fun `next occurrence is strictly after today`() {
        assertEquals(LocalDate.of(2026, 11, 6), QuickDates.nextOccurrence(friday, DayOfWeek.FRIDAY))
        assertEquals(LocalDate.of(2026, 10, 31), QuickDates.nextOccurrence(friday, DayOfWeek.SATURDAY))
    }

    @Test
    fun `month grid starts on monday and pads with nulls`() {
        val weeks = MonthGrid.weeks(YearMonth.of(2026, 10))
        assertEquals(5, weeks.size)
        assertNull(weeks[0][0])
        assertNull(weeks[0][2])
        assertEquals(LocalDate.of(2026, 10, 1), weeks[0][3])
        assertEquals(LocalDate.of(2026, 10, 31), weeks[4][5])
        assertNull(weeks[4][6])
        assertEquals(true, weeks.all { it.size == 7 })
    }

    @Test
    fun `month starting on monday has no leading padding`() {
        val weeks = MonthGrid.weeks(YearMonth.of(2026, 6))
        assertEquals(LocalDate.of(2026, 6, 1), weeks[0][0])
    }
}
