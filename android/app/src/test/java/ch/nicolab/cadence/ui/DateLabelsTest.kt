package ch.nicolab.cadence.ui

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class DateLabelsTest {
    @Test
    fun `short date is day and abbreviated French month`() {
        assertEquals("30 oct.", LocalDate.of(2026, 10, 30).shortFrench())
        assertEquals("1 janv.", LocalDate.of(2026, 1, 1).shortFrench())
    }

    @Test
    fun `an ISO label is localised and any other label is kept`() {
        assertEquals("30 oct.", shortFrenchOrSame("2026-10-30"))
        assertEquals("Semaine 43", shortFrenchOrSame("Semaine 43"))
    }
}
