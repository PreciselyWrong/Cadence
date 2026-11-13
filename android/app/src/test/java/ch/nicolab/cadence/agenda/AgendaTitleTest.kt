package ch.nicolab.cadence.agenda

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AgendaTitleTest {
    private val friday = LocalDate.of(2026, 11, 13)

    @Test
    fun `le jour s'écrit en entier, puis en forme courte quand la place manque`() {
        assertEquals("Vendredi 13 novembre", dayLabel(friday))
        assertEquals("Ven. 13 nov.", compactDayLabel(friday))
    }

    @Test
    fun `le mois court garde l'année`() {
        assertEquals("Nov. 2026", compactMonthLabel(friday))
    }
}
