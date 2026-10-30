package ch.nicolab.cadence.tasks.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.RelativeDay
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.abs

/** [LONG] : « Aujourd'hui », « jeudi 5 nov. » ; [SHORT] : « Auj. », « jeu. » (jour du mois au-delà d'une semaine). */
internal enum class DayLabelStyle { LONG, SHORT }

/** Mots relatifs, injectés pour que le calcul reste du Kotlin pur. */
internal data class DayWords(val today: String, val tomorrow: String, val yesterday: String)

private const val SHORT_WEEKDAY_RANGE = 6L

/**
 * Libellé d'un jour par rapport à [today], partagé par les badges de date des lignes, les en-têtes de
 * section et la bande de la semaine : Hier, Aujourd'hui (Auj.), Demain, sinon le jour de la semaine.
 */
internal fun dayLabelOf(date: LocalDate, today: LocalDate, words: DayWords, style: DayLabelStyle = DayLabelStyle.LONG): String =
    when (RelativeDay.of(date, today)) {
        RelativeDay.TODAY -> words.today
        RelativeDay.TOMORROW -> words.tomorrow
        RelativeDay.YESTERDAY -> words.yesterday
        RelativeDay.OTHER -> when (style) {
            DayLabelStyle.LONG -> date.format(DateTimeFormatter.ofPattern("EEEE d MMM", tasksLocale))
            DayLabelStyle.SHORT ->
                if (abs(ChronoUnit.DAYS.between(today, date)) <= SHORT_WEEKDAY_RANGE) {
                    date.format(DateTimeFormatter.ofPattern("EEE", tasksLocale))
                } else {
                    date.format(DateTimeFormatter.ofPattern("d MMM", tasksLocale))
                }
        }
    }

@Composable
internal fun dayLabel(date: LocalDate, today: LocalDate, style: DayLabelStyle = DayLabelStyle.LONG): String {
    val words = DayWords(
        today = stringResource(if (style == DayLabelStyle.SHORT) R.string.tasks_day_today_short else R.string.tasks_day_today),
        tomorrow = stringResource(R.string.tasks_day_tomorrow),
        yesterday = stringResource(R.string.tasks_day_yesterday),
    )
    return dayLabelOf(date, today, words, style)
}
