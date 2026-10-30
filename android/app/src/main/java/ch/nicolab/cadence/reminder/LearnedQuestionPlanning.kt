package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.domain.LearnedQuestion
import java.time.LocalTime
import java.time.ZonedDateTime

/** Une notification par question seule ; plusieurs questions à la même heure se regroupent. */
sealed interface LearnedQuestionNotificationPlan {
    data object None : LearnedQuestionNotificationPlan

    data class Single(val question: LearnedQuestion) : LearnedQuestionNotificationPlan

    data class Grouped(val questions: List<LearnedQuestion>) : LearnedQuestionNotificationPlan

    companion object {
        fun of(questions: List<LearnedQuestion>): LearnedQuestionNotificationPlan = when (questions.size) {
            0 -> None
            1 -> Single(questions.single())
            else -> Grouped(questions)
        }
    }
}

/**
 * Quand réveiller l'alarme d'une heure de question. Une alarme inexacte se déclenche dans une
 * fenêtre : pendant cette fenêtre, l'alarme du jour existe encore et ne doit pas être remplacée
 * par celle du lendemain, sinon la question du jour serait perdue.
 */
object LearnedQuestionSchedule {
    /** Fenêtre de livraison d'une alarme inexacte. */
    const val WINDOW_MINUTES = 15L

    sealed interface Decision {
        data class Today(val trigger: ZonedDateTime) : Decision

        data class Tomorrow(val trigger: ZonedDateTime) : Decision

        data object Skip : Decision
    }

    fun decide(now: ZonedDateTime, askAt: LocalTime): Decision {
        val today = now.toLocalDate().atTime(askAt).atZone(now.zone)
        return when {
            now.isBefore(today) -> Decision.Today(today)
            now.isBefore(today.plusMinutes(WINDOW_MINUTES)) -> Decision.Skip
            else -> Decision.Tomorrow(today.plusDays(1))
        }
    }

    /** Après la livraison de l'alarme, la question suivante est toujours celle du lendemain. */
    fun afterDelivery(now: ZonedDateTime, askAt: LocalTime): ZonedDateTime =
        now.toLocalDate().plusDays(1).atTime(askAt).atZone(now.zone)
}
