package ch.nicolab.cadence.domain

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ProgressionOverflowTest {
    @Test fun `large steps reach cap before numeric overflow`() {
        val start = LocalDate.of(2026, 9, 9)
        val progression = GoalProgression(Long.MAX_VALUE, ProgressionCadence.WEEKLY, 100, start)
        assertEquals(100L, progression.targetAt(10, start.plusWeeks(2)))
        assertEquals(Long.MAX_VALUE, progression.copy(capMinor = null).targetAt(10, start.plusWeeks(2)))
    }
}
