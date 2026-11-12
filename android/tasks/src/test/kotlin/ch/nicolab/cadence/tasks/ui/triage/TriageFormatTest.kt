package ch.nicolab.cadence.tasks.ui.triage

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TriageFormatTest {
    @Test
    fun dueChipIsTheShortLowercaseDayAndItsNumber() {
        assertEquals("jeu 5", TriageFormat.dueChip(LocalDate.parse("2026-11-05")))
        assertEquals("sam 14", TriageFormat.dueChip(LocalDate.parse("2026-11-14")))
    }
}
