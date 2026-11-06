package ch.nicolab.cadence.tasks.ui.brief

import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/** Libellés du résumé, purs : pas de contexte Android, testés sur la JVM. */
internal object BriefFormat {
    private val longDate = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)
    private val clockTime = DateTimeFormatter.ofPattern("HH:mm")

    /** Motifs qui ne font que répéter l'échéance, déjà écrite sur la ligne de tâche. */
    private val DUE_DATE_REASONS = setOf("overdue", "due_today", "due_tomorrow")

    /** Motif à écrire sous une tâche : rien s'il redit l'échéance. Un résumé plus ancien n'a pas de code et garde son texte. */
    fun visibleReason(reason: String, code: String?): String? = reason.ifBlank { null }.takeUnless { code in DUE_DATE_REASONS }

    /** Heure locale « 07:05 » d'un instant ISO ; null s'il est illisible. */
    fun clockAt(instant: String?, zone: ZoneId): String? =
        instant?.let { runCatching { OffsetDateTime.parse(it).atZoneSameInstant(zone).format(clockTime) }.getOrNull() }

    /** « Mercredi 4 novembre ». */
    fun longDate(date: LocalDate): String = capitalize(date.format(longDate))

    /** « Sam 7 » : le jour court et le quantième, pastille du déplacement. */
    fun chip(date: LocalDate): String =
        capitalize(date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.FRENCH).removeSuffix(".").take(3)) + " " + date.dayOfMonth

    /** « jeu 6 » : le jour court en minuscules, pour « Échéance : jeu 6 ». */
    fun dueChip(date: LocalDate): String = chip(date).lowercase(Locale.FRENCH)

    /** Nom du jour (« Jeudi ») ; null pour le jour même, dont le libellé vient des ressources. */
    fun dayTitle(date: LocalDate, today: LocalDate): String? =
        if (date == today) null else capitalize(date.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.FRENCH))

    /** Durée décomposée en heures et minutes ; le libellé et son unité sont posés par l'interface. */
    fun hoursAndMinutes(minutes: Int): Pair<Int, Int> = minutes / 60 to minutes % 60

    /** Minutes après minuit « HH:mm ». */
    fun clock(minute: Int): String = "%d:%02d".format(minute / 60, minute % 60)

    /** Nom complet d'un jour de la semaine (0 = dimanche, comme les réglages du brief). */
    fun weekday(index: Int): String =
        capitalize(java.time.DayOfWeek.of(if (index == 0) 7 else index).getDisplayName(TextStyle.FULL, Locale.FRENCH))

    /** Heure « HH:mm » en minutes après minuit ; null si le texte n'est pas une heure. */
    fun parseMinute(value: String?): Int? {
        val parts = value?.split(":") ?: return null
        if (parts.size != 2) return null
        val hour = parts[0].toIntOrNull() ?: return null
        val minute = parts[1].toIntOrNull() ?: return null
        return if (hour in 0..24 && minute in 0..59) hour * 60 + minute else null
    }

    /** Jours écoulés depuis [date] (0 si la date est aujourd'hui ou dans le futur). */
    fun daysSince(date: LocalDate, today: LocalDate): Int = java.time.temporal.ChronoUnit.DAYS.between(date, today).toInt().coerceAtLeast(0)

    private fun capitalize(value: String) = value.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.FRENCH) else it.toString() }
}
