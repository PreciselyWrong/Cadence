package ch.nicolab.cadence.habits

import ch.nicolab.cadence.domain.LearnedAnswerKind
import ch.nicolab.cadence.domain.LearnedQuestion
import java.time.DayOfWeek
import java.time.format.TextStyle
import java.util.Locale

/** Libellés et conversions d'une question apprise, sans Android : les phrases restent dans strings.xml. */
internal object LearnedQuestionText {
    fun weekdayName(day: DayOfWeek): String = day.getDisplayName(TextStyle.FULL, Locale.FRENCH)

    fun shortWeekdayName(day: DayOfWeek): String = day.getDisplayName(TextStyle.SHORT, Locale.FRENCH)

    fun isAlcohol(question: LearnedQuestion): Boolean = LearnedAnswerKind.STANDARD_DRINKS in question.answerKinds

    /** Une quantité saisie dans l'unité affichée devient la valeur stockée de l'habitude. */
    fun canonicalAmount(displayAmount: Long, question: LearnedQuestion): Long =
        if (isAlcohol(question)) displayAmount else displayAmount * (question.unit?.scaleToCanonical ?: 1L)

    /** Pour l'alcool, « Oui » doit toujours mener au nombre de verres : sans lui, la journée resterait inconnue. */
    fun yesRequiresAmount(question: LearnedQuestion): Boolean =
        isAlcohol(question) && LearnedAnswerKind.YES in question.answerKinds

    fun offersAmount(question: LearnedQuestion): Boolean =
        question.answerKinds.any {
            it == LearnedAnswerKind.QUANTITY || it == LearnedAnswerKind.DURATION || it == LearnedAnswerKind.STANDARD_DRINKS
        }
}
