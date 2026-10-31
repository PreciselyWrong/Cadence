package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.domain.LearnedAnswerKind
import ch.nicolab.cadence.domain.LearnedEvidence
import ch.nicolab.cadence.domain.LearnedQuestion
import ch.nicolab.cadence.habits.LearnedQuestionText
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LearnedQuestionYesActionTest {
    private fun question(kinds: List<LearnedAnswerKind>) = LearnedQuestion(
        habitId = "h",
        date = LocalDate.of(2026, 10, 29),
        weekday = DayOfWeek.THURSDAY,
        evidence = LearnedEvidence(DayOfWeek.THURSDAY, 9, 12),
        answerKinds = kinds,
        unit = null,
        usualMinuteOfDay = null,
        askAt = LocalTime.of(9, 0),
    )

    private val alcohol = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS))
    private val tracker = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES))

    @Test fun `yes on an alcohol notification opens the app to count the drinks instead of recording an unknown quantity`() {
        assertEquals(LearnedQuestionYesAction.OPEN_TO_ENTER_AMOUNT, LearnedQuestionYesAction.of(alcohol))
    }

    @Test fun `yes on other questions is answered straight from the notification`() {
        assertEquals(LearnedQuestionYesAction.ANSWER_IN_PLACE, LearnedQuestionYesAction.of(tracker))
    }

    @Test fun `in the app, yes for alcohol leads to the drinks count and the bare yes is not offered`() {
        assertTrue(LearnedQuestionText.yesRequiresAmount(alcohol))
        assertFalse(LearnedQuestionText.yesRequiresAmount(tracker))
    }
}
