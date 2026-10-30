package ch.nicolab.cadence.tasks.ui

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ShowsDueDayTest {
    private val day = LocalDate.of(2026, 11, 1)

    @Test
    fun `la date est masquée quand la section porte déjà le jour de l'échéance`() {
        assertFalse(showsDueDay(dueDay = day, sectionDay = day, overdue = false))
    }

    @Test
    fun `la date reste visible pour un autre jour que celui de la section`() {
        assertTrue(showsDueDay(dueDay = day, sectionDay = day.plusDays(1), overdue = false))
    }

    @Test
    fun `la date reste visible sans section`() {
        assertTrue(showsDueDay(dueDay = day, sectionDay = null, overdue = false))
    }

    @Test
    fun `la date reste visible pour une tâche en retard même dans sa section`() {
        assertTrue(showsDueDay(dueDay = day, sectionDay = day, overdue = true))
    }
}
