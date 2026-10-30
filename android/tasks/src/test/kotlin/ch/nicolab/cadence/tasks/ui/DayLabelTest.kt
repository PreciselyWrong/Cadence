package ch.nicolab.cadence.tasks.ui

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class DayLabelTest {
    private val today = LocalDate.of(2026, 10, 30)
    private val words = DayWords("Aujourd'hui", "Demain", "Hier")
    private val shortWords = DayWords("Auj.", "Demain", "Hier")

    @Test
    fun `relative days use the injected words`() {
        assertEquals("Aujourd'hui", dayLabelOf(today, today, words))
        assertEquals("Demain", dayLabelOf(today.plusDays(1), today, words))
        assertEquals("Hier", dayLabelOf(today.minusDays(1), today, words))
        assertEquals("Auj.", dayLabelOf(today, today, shortWords, DayLabelStyle.SHORT))
    }

    @Test
    fun `long style names the weekday and date`() {
        assertEquals("lundi 2 nov.", dayLabelOf(today.plusDays(3), today, words))
    }

    @Test
    fun `short style keeps only the weekday within a week, then the date`() {
        assertEquals("lun.", dayLabelOf(today.plusDays(3), today, shortWords, DayLabelStyle.SHORT))
        assertEquals("13 nov.", dayLabelOf(today.plusDays(14), today, shortWords, DayLabelStyle.SHORT))
    }
}
