package ch.nicolab.cadence.agenda

import java.time.LocalDate
import java.time.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AgendaSlotTest {

    private val day = LocalDate.of(2026, 10, 30)
    private val hour = 100f

    @Test
    fun `a tap inside a half hour slot starts that slot`() {
        assertEquals(LocalDateTime.of(2026, 10, 30, 9, 0), slotDateTime(day, 9.05f * hour, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 9, 0), slotDateTime(day, 9.45f * hour, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 9, 30), slotDateTime(day, 9.5f * hour, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 14, 30), slotDateTime(day, 14.99f * hour, hour))
    }

    @Test
    fun `a tap stays inside the day`() {
        assertEquals(LocalDateTime.of(2026, 10, 30, 0, 0), slotDateTime(day, -40f, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 23, 30), slotDateTime(day, 24f * hour + 500f, hour))
    }
}
