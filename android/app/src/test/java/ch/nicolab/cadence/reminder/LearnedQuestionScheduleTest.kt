package ch.nicolab.cadence.reminder

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LearnedQuestionScheduleTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val askAt = LocalTime.of(9, 0)
    private val today = LocalDate.of(2026, 10, 30)

    private fun at(hour: Int, minute: Int) = ZonedDateTime.of(today, LocalTime.of(hour, minute), zone)

    @Test fun `before the hour the question is scheduled today`() {
        val decision = LearnedQuestionSchedule.decide(at(8, 0), askAt)

        assertEquals(LearnedQuestionSchedule.Decision.Today(at(9, 0)), decision)
    }

    @Test fun `inside the delivery window an existing alarm is kept untouched`() {
        assertEquals(LearnedQuestionSchedule.Decision.Skip, LearnedQuestionSchedule.decide(at(9, 5), askAt))
    }

    @Test fun `after the window the next question is scheduled tomorrow`() {
        val decision = LearnedQuestionSchedule.decide(at(9, 30), askAt)

        assertEquals(LearnedQuestionSchedule.Decision.Tomorrow(at(9, 0).plusDays(1)), decision)
    }

    @Test fun `after a delivery the next question is always tomorrow`() {
        assertEquals(
            at(9, 0).plusDays(1),
            LearnedQuestionSchedule.afterDelivery(at(9, 2), askAt),
        )
        assertTrue(LearnedQuestionSchedule.afterDelivery(at(9, 2), askAt).isAfter(at(9, 2)))
    }
}
