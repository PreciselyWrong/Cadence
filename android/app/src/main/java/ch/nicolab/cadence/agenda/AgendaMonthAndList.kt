package ch.nicolab.cadence.agenda

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.designsystem.components.EventCheck
import ch.nicolab.cadence.designsystem.components.NavigationSpacer
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

private val HOUR_MINUTE: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Vue Mois : grille de semaines, pastilles colorées par jour, puis les éléments du jour choisi.
 * Le balayage horizontal sur l'en-tête change de mois.
 */
@Composable
internal fun ColumnScope.MonthAgenda(
    state: AgendaUiState,
    onSelect: (LocalDate) -> Unit,
    onSwipe: (Int) -> Unit,
    onToggleEvent: (EventInstanceKey) -> Unit,
) {
    val month = YearMonth.from(state.selected)
    val rows = remember(month) { monthGrid(month).chunked(DayOfWeek.entries.size) }
    val dots = remember(state.entries) { dotsByDay(state.entries) }
    val dayEntries = remember(state.entries, state.selected) {
        listGroups(state.entries, state.selected, 1).firstOrNull()?.entries.orEmpty()
    }
    val swipe = rememberHorizontalSwipe(onSwipe)

    LazyColumn(
        Modifier.weight(1f),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = Space.md).then(swipe)) {
                weekdayNames(state.options.weekends).forEach { name ->
                    Text(
                        text = name,
                        style = MaterialTheme.typography.labelMedium,
                        color = cadence.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        items(rows, key = { it.first().toString() }) { week ->
            Row(Modifier.fillMaxWidth()) {
                week.filter { state.options.weekends || !it.isWeekend() }.forEach { day ->
                    MonthCell(
                        day = day,
                        inMonth = YearMonth.from(day) == month,
                        selected = day == state.selected,
                        today = day == state.today,
                        dots = dots[day].orEmpty(),
                        onClick = { onSelect(day) },
                    )
                }
            }
        }
        item {
            SectionHeader(title = dayLabel(state.selected), count = dayEntries.size)
        }
        if (dayEntries.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.agenda_empty_day),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurfaceVariant,
                )
            }
        }
        items(dayEntries) { entry ->
            AgendaEntryRow(entry = entry, checkEvents = state.checkEvents, onToggleEvent = onToggleEvent)
        }
        item { NavigationSpacer() }
    }
}

@Composable
private fun RowScope.MonthCell(
    day: LocalDate,
    inMonth: Boolean,
    selected: Boolean,
    today: Boolean,
    dots: List<AgendaEntry>,
    onClick: () -> Unit,
) {
    val palette = cadence
    Column(
        Modifier
            .weight(1f)
            .height(Size.control)
            .clip(Radius.Chip)
            .clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier
                .size(Size.actionSm)
                .clip(Radius.Pill)
                .background(if (selected) palette.primary else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = day.dayOfMonth.toString(),
                style = MaterialTheme.typography.bodyLarge,
                color = when {
                    selected -> palette.onPrimary
                    today -> palette.primary
                    inMonth -> palette.onSurface
                    else -> palette.onSurfaceVariant
                },
            )
        }
        Row(
            Modifier.height(Size.agendaDot),
            horizontalArrangement = Arrangement.spacedBy(Space.xs / 2),
        ) {
            dots.forEach { entry ->
                Box(
                    Modifier
                        .size(Size.agendaDot)
                        .clip(Radius.Pill)
                        .background(
                            when {
                                selected -> palette.onPrimary
                                else -> entry.colorArgb?.let { Color(it) } ?: palette.primary
                            },
                        ),
                )
            }
        }
    }
}

/**
 * Vue Liste : les 30 jours à partir du jour choisi (aujourd'hui par défaut), groupés par date. Les jours sans
 * élément n'apparaissent pas.
 */
@Composable
internal fun ColumnScope.ListAgenda(state: AgendaUiState, onToggleEvent: (EventInstanceKey) -> Unit) {
    val groups = remember(state.entries, state.selected) { listGroups(state.entries, state.selected, AGENDA_LIST_DAYS) }
    LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        if (groups.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.agenda_empty_list),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.onSurfaceVariant,
                    modifier = Modifier.padding(top = Space.md),
                )
            }
        }
        groups.forEach { group ->
            item(key = "day-${group.date}") {
                SectionHeader(title = dayLabel(group.date), count = group.entries.size, modifier = Modifier.padding(top = Space.md))
            }
            items(group.entries) { entry ->
                AgendaEntryRow(entry = entry, checkEvents = state.checkEvents, onToggleEvent = onToggleEvent)
            }
        }
        item { NavigationSpacer() }
    }
}

/** Ligne d'élément : rail de couleur, case ronde pour un événement coché dans Cadence, horaire et source. */
@Composable
internal fun AgendaEntryRow(
    entry: AgendaEntry,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val color = entry.colorArgb?.let { Color(it) } ?: palette.primary
    Panel(modifier = modifier.fillMaxWidth().alpha(if (entry.done) DONE_ALPHA else 1f)) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(Size.rail).fillMaxHeight().background(color))
            Row(
                Modifier.weight(1f).padding(horizontal = Space.md, vertical = Space.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (entry is AgendaEntry.Event && checkEvents) {
                    EventCheckRow(entry = entry, color = color, onToggleEvent = onToggleEvent)
                    Spacer(Modifier.width(Space.md))
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = entry.title.ifBlank { stringResource(R.string.agenda_untitled) },
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.onSurface,
                        textDecoration = if (entry.done) TextDecoration.LineThrough else null,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = agendaMeta(entry),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** Libellé « horaire · source » ; une journée entière ne montre pas d'horaire. */
@Composable
internal fun agendaMeta(entry: AgendaEntry): String {
    val time = when {
        entry.allDay -> stringResource(R.string.agenda_all_day)
        entry is AgendaEntry.Event -> stringResource(
            R.string.agenda_time_range,
            entry.start.format(HOUR_MINUTE),
            entry.end.format(HOUR_MINUTE),
        )
        else -> entry.start.format(HOUR_MINUTE)
    }
    val source = when (entry) {
        is AgendaEntry.Event -> entry.calendarName
        is AgendaEntry.Task -> stringResource(R.string.agenda_task_kind)
        is AgendaEntry.Habit -> stringResource(R.string.agenda_habit_kind)
    }
    return stringResource(R.string.agenda_meta, time, source)
}

@Composable
private fun EventCheckRow(entry: AgendaEntry.Event, color: Color, onToggleEvent: (EventInstanceKey) -> Unit) {
    EventCheck(
        checked = entry.done,
        color = color,
        onCheckedChange = { onToggleEvent(entry.eventKey) },
        contentDescription = stringResource(
            if (entry.done) R.string.agenda_mark_undone else R.string.agenda_mark_done,
        ),
    )
}

private fun weekdayNames(weekends: Boolean): List<String> =
    DayOfWeek.entries
        .filter { weekends || it != DayOfWeek.SATURDAY && it != DayOfWeek.SUNDAY }
        .map { it.getDisplayName(TextStyle.NARROW, Locale.FRENCH).uppercase(Locale.FRENCH) }
