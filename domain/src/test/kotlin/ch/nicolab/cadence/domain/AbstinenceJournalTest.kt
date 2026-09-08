package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AbstinenceJournalTest {
    private val today = LocalDate.of(2026, 9, 8)
    private fun log(back: Long, kind: AbstinenceLogKind = AbstinenceLogKind.CHECK_IN, intensity: Int? = null) =
        AbstinenceLog("log-$back-$kind", "h", today.minusDays(back).atStartOfDay().toInstant(ZoneOffset.UTC),
            today.minusDays(back), ZoneOffset.UTC, kind, intensity)

    @Test fun `journal includes today but ignores other habits and unobserved dates`() {
        val logs = listOf(log(0), log(0).copy(id = "second"), log(29), log(30), log(-1),
            log(1).copy(habitId = "other"), log(0, AbstinenceLogKind.URGE, 5),
            log(2, AbstinenceLogKind.URGE, 2))
        val occurrence = HabitEntry("e", "h", logs.first().occurredAt, today, ZoneOffset.UTC, 1)
        val summary = AbstinenceJournalSummary.compute("h", today.minusDays(60), today, logs, listOf(occurrence))
        assertTrue(summary.checkedInToday)
        assertEquals(2, summary.checkInDays30)
        assertEquals(2, summary.urgeCount30)
        assertEquals(1, summary.strongUrges30)
        assertEquals(1, AbstinenceJournalSummary.compute("h", today, today, logs, emptyList()).checkInDays30)
    }

    @Test fun `urge intensity is required and checkins have none`() {
        assertThrows(IllegalArgumentException::class.java) { log(0, AbstinenceLogKind.URGE) }
        assertThrows(IllegalArgumentException::class.java) { log(0, AbstinenceLogKind.URGE, 6) }
        assertThrows(IllegalArgumentException::class.java) { log(0, intensity = 1) }
        assertThrows(IllegalArgumentException::class.java) { log(0).copy(note = "x".repeat(501)) }
        assertEquals(500, log(0).copy(note = "x".repeat(500)).note!!.length)
    }
}
