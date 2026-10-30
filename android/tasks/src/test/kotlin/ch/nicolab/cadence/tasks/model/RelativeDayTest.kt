package ch.nicolab.cadence.tasks.model

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RelativeDayTest {
    private val today = LocalDate.of(2026, 10, 30)

    @Test
    fun `yesterday, today and tomorrow are named, any other day is not`() {
        assertEquals(RelativeDay.YESTERDAY, RelativeDay.of(today.minusDays(1), today))
        assertEquals(RelativeDay.TODAY, RelativeDay.of(today, today))
        assertEquals(RelativeDay.TOMORROW, RelativeDay.of(today.plusDays(1), today))
        assertEquals(RelativeDay.OTHER, RelativeDay.of(today.plusDays(2), today))
        assertEquals(RelativeDay.OTHER, RelativeDay.of(today.minusDays(2), today))
    }

    @Test
    fun `month boundaries are handled`() {
        assertEquals(RelativeDay.TOMORROW, RelativeDay.of(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 10, 31)))
    }
}
