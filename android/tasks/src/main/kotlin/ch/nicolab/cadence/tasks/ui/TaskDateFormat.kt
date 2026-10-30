package ch.nicolab.cadence.tasks.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.tasks.R
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle

private val shortDate: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", tasksLocale)
private val shortDateYear: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM yyyy", tasksLocale)
private val monthYear: DateTimeFormatter = DateTimeFormatter.ofPattern("LLLL yyyy", tasksLocale)
private val weekdayShort: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d MMM", tasksLocale)

/** « Aujourd'hui », « Demain », « Hier », sinon « 28 oct. » (l'année s'ajoute hors de l'année en cours). */
@Composable
internal fun compactDate(date: LocalDate, today: LocalDate): String {
    val relative = when (date) {
        today -> stringResource(R.string.tasks_day_today)
        today.plusDays(1) -> stringResource(R.string.tasks_day_tomorrow)
        today.minusDays(1) -> stringResource(R.string.tasks_day_yesterday)
        else -> null
    }
    return relative ?: date.format(if (date.year == today.year) shortDate else shortDateYear)
}

@Composable
internal fun compactDateTime(date: LocalDate, time: LocalTime?, today: LocalDate): String =
    compactDate(date, today) + time?.let { " " + wireTime(it) }.orEmpty()

/** Jour sans relatif, pour la date calculée d'un raccourci : « sam. 31 oct. ». */
internal fun weekdayDate(date: LocalDate): String = date.format(weekdayShort)

/** « Octobre 2026 ». */
internal fun monthTitle(month: YearMonth): String =
    month.format(monthYear).replaceFirstChar { it.uppercase(tasksLocale) }

/** Initiales des jours, lundi en premier : « L M M J V S D ». */
internal fun weekdayInitials(): List<String> =
    DayOfWeek.entries.map { it.getDisplayName(TextStyle.NARROW, tasksLocale).uppercase(tasksLocale) }
