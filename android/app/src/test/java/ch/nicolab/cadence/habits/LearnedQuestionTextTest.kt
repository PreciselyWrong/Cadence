package ch.nicolab.cadence.habits

import ch.nicolab.cadence.domain.LearnedAnswerKind
import ch.nicolab.cadence.domain.LearnedEvidence
import ch.nicolab.cadence.domain.LearnedQuestion
import ch.nicolab.cadence.domain.MeasurementUnit
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LearnedQuestionTextTest {
    private fun question(
        kinds: List<LearnedAnswerKind>,
        unit: MeasurementUnit? = null,
    ) = LearnedQuestion(
        habitId = "h",
        date = LocalDate.of(2026, 10, 29),
        weekday = DayOfWeek.THURSDAY,
        evidence = LearnedEvidence(DayOfWeek.THURSDAY, 9, 12),
        answerKinds = kinds,
        unit = unit,
        usualMinuteOfDay = null,
        askAt = LocalTime.of(9, 0),
    )

    @Test fun `weekday names are french, full and short`() {
        assertEquals("jeudi", LearnedQuestionText.weekdayName(DayOfWeek.THURSDAY))
        assertEquals("jeu.", LearnedQuestionText.shortWeekdayName(DayOfWeek.THURSDAY))
    }

    @Test fun `alcohol is recognised by its standard drinks answer`() {
        val alcohol = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS))
        val tracker = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES))

        assertTrue(LearnedQuestionText.isAlcohol(alcohol))
        assertFalse(LearnedQuestionText.isAlcohol(tracker))
    }

    @Test fun `a typed amount becomes the stored canonical value`() {
        val minutes = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.DURATION), MeasurementUnit.MINUTES)
        val alcohol = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.STANDARD_DRINKS))

        assertEquals(1200L, LearnedQuestionText.canonicalAmount(20, minutes))
        assertEquals(2L, LearnedQuestionText.canonicalAmount(2, alcohol))
    }
}
