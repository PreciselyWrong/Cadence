package ch.nicolab.cadence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import ch.nicolab.cadence.R
import ch.nicolab.cadence.ui.HabitLabels
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

enum class ActivityCalendarTone {
    SUCCESS,
    SUCCESS_SOFT,
    DANGER,
    NEUTRAL,
}

data class ActivityCalendarCell(
    val date: LocalDate,
    val tone: ActivityCalendarTone,
    val contentDescription: String,
    val detailText: String? = null,
)

enum class CalendarPeriod(val days: Int?, val labelRes: Int) {
    DAYS_30(30, R.string.stats_period_30d),
    DAYS_90(90, R.string.stats_period_90d),
    YEAR_1(365, R.string.stats_period_1y),
    ALL_TIME(null, R.string.stats_period_all),
}

@Composable
fun CalendarPeriodSelector(
    selected: CalendarPeriod,
    onSelect: (CalendarPeriod) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(Radius.Pill)
            .background(palette.sunken)
            .padding(Space.xs),
        horizontalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        CalendarPeriod.entries.forEach { period ->
            val isSelected = period == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(Radius.Pill)
                    .background(if (isSelected) palette.surface else Color.Transparent)
                    .clickable { onSelect(period) }
                    .padding(vertical = Space.sm),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(period.labelRes),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isSelected) palette.accent else palette.inkMuted,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
fun ActivityCalendar(
    cells: List<ActivityCalendarCell>,
    modifier: Modifier = Modifier,
    today: LocalDate = LocalDate.now(),
    title: String? = null,
    helpText: String? = null,
    onCellClick: ((ActivityCalendarCell) -> Unit)? = null,
) {
    if (cells.isEmpty()) return
    val palette = cadence
    var selectedDateString by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedCell = cells.firstOrNull { it.date.toString() == selectedDateString }
    val months = remember(cells) {
        cells.groupBy { YearMonth.from(it.date) }
    }

    Column(modifier.testTag("activity_calendar")) {
        if (title != null) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = palette.ink)
        }
        if (helpText != null) {
            Text(helpText, style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
        }
        if (title != null || helpText != null) {
            Spacer(Modifier.height(Space.md))
        }

        months.forEach { (yearMonth, monthCells) ->
            if (months.size > 1) {
                Text(
                    text = formatMonthTitle(yearMonth),
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.ink,
                )
                Spacer(Modifier.height(Space.xs))
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                DayOfWeek.entries.forEach { day ->
                    Text(
                        text = stringResource(HabitLabels.dayShort(day)),
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.inkMuted,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            val leadingBlanks = monthCells.first().date.dayOfWeek.value - 1
            val gridItems = List<ActivityCalendarCell?>(leadingBlanks) { null } + monthCells

            gridItems.chunked(7).forEach { week ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                    repeat(7) { index ->
                        val cell = week.getOrNull(index)
                        if (cell == null) {
                            Spacer(Modifier.weight(1f).height(Size.touch))
                        } else {
                            val isSelected = cell.date.toString() == selectedDateString
                            val isToday = cell.date == today
                            val color = when (cell.tone) {
                                ActivityCalendarTone.SUCCESS -> palette.success
                                ActivityCalendarTone.SUCCESS_SOFT -> palette.successSoft
                                ActivityCalendarTone.DANGER -> palette.danger
                                ActivityCalendarTone.NEUTRAL -> palette.sunken
                            }
                            val textColor = when (cell.tone) {
                                ActivityCalendarTone.SUCCESS, ActivityCalendarTone.DANGER -> onColorOf(color)
                                else -> palette.ink
                            }

                            val containerModifier = Modifier
                                .weight(1f)
                                .height(Size.touch)
                                .clip(Radius.Control)
                                .then(
                                    if (isSelected) Modifier.background(palette.accentSoft)
                                    else if (isToday) Modifier.background(palette.sunken)
                                    else Modifier
                                )
                                .clickable {
                                    selectedDateString = cell.date.toString()
                                    onCellClick?.invoke(cell)
                                }
                                .semantics { contentDescription = cell.contentDescription }
                                .testTag("activity_calendar_cell_${cell.date}")

                            Box(
                                modifier = containerModifier,
                                contentAlignment = Alignment.Center,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(Size.calendarMark)
                                        .clip(Radius.Chip)
                                        .background(color),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = cell.date.dayOfMonth.toString(),
                                        color = textColor,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (months.size > 1) {
                Spacer(Modifier.height(Space.md))
            }
        }

        selectedCell?.detailText?.let { detail ->
            Spacer(Modifier.height(Space.sm))
            Text(
                text = detail,
                style = MaterialTheme.typography.bodyMedium,
                color = palette.ink,
                modifier = Modifier.testTag("activity_calendar_selected_detail"),
            )
        }
    }
}

private fun formatMonthTitle(yearMonth: YearMonth): String {
    val name = yearMonth.month.getDisplayName(TextStyle.FULL, Locale.FRENCH)
        .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.FRENCH) else it.toString() }
    return "$name ${yearMonth.year}"
}
