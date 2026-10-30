package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.domain.LearnedAnswerKind
import ch.nicolab.cadence.domain.LearnedEvidence
import ch.nicolab.cadence.domain.LearnedQuestion
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LearnedQuestionNotificationPlanTest {
    private fun question(habitId: String) = LearnedQuestion(
        habitId = habitId,
        date = LocalDate.of(2026, 10, 29),
        weekday = DayOfWeek.THURSDAY,
        evidence = LearnedEvidence(DayOfWeek.THURSDAY, 9, 12),
        answerKinds = listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES),
        unit = null,
        usualMinuteOfDay = null,
        askAt = LocalTime.of(9, 0),
    )

    @Test fun `no pending question posts nothing`() {
        assertTrue(LearnedQuestionNotificationPlan.of(emptyList()) is LearnedQuestionNotificationPlan.None)
    }

    @Test fun `one question keeps its own notification with answer actions`() {
        val plan = LearnedQuestionNotificationPlan.of(listOf(question("a")))

        assertEquals("a", (plan as LearnedQuestionNotificationPlan.Single).question.habitId)
    }

    @Test fun `several questions at the same hour are grouped in their order`() {
        val plan = LearnedQuestionNotificationPlan.of(listOf(question("a"), question("b")))

        assertEquals(listOf("a", "b"), (plan as LearnedQuestionNotificationPlan.Grouped).questions.map { it.habitId })
    }
}
