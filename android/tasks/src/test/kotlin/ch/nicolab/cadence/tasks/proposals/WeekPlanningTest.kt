package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WeekPlanningTest {
    private val saturday = LocalDate.of(2026, 11, 14)

    @Test
    fun `le lien de la semaine se montre le dimanche et le lundi, ou dès qu'une proposition est en cours`() {
        assertFalse(WeekPlanning.linkVisible(saturday, ProposalPhase.Idle))
        assertTrue(WeekPlanning.linkVisible(saturday.plusDays(1), ProposalPhase.Idle))
        assertTrue(WeekPlanning.linkVisible(saturday.plusDays(2), ProposalPhase.Idle))
        assertFalse(WeekPlanning.linkVisible(saturday.plusDays(3), ProposalPhase.Idle))
    }
}
