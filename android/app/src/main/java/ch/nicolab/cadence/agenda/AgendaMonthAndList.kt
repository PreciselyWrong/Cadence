package ch.nicolab.cadence.agenda

import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.designsystem.components.NavigationSpacer
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

private val HOUR_MINUTE: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val SPOKEN_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)

/** Date lue par le lecteur d'écran pour une case de jour : « mardi 27 octobre ». */
internal fun java.time.LocalDate.agendaDayDescription(): String = format(SPOKEN_DAY)
private val WEEKDAY_HEADER_HEIGHT = 20.dp
private val ROW_MIN_HEIGHT = 56.dp
private val MONTH_DAY_GAP = 2.dp
private val MONTH_TASK_DOT = RoundedCornerShape(1.dp)
private const val OFF_MONTH_ALPHA = 0.38f

/**
 * Vue Mois : grille compacte (au plus 40 % de l'écran), pastilles colorées par jour, puis la liste du
 * jour choisi dans la place restante. Le balayage horizontal sur la grille change de mois.
 */
@Composable
internal fun ColumnScope.MonthAgenda(
    state: AgendaUiState,
    onSelect: (LocalDate) -> Unit,
    onToggleEvent: (EventInstanceKey) -> Unit,
    onToggleTask: (AgendaEntry.Task) -> Unit,
) {
    val month = YearMonth.from(state.selected)
    val rows = remember(month) { monthGrid(month).chunked(DayOfWeek.entries.size) }
    val dots = remember(state.entries) { dotsByDay(state.entries) }
    val dayEntries = remember(state.entries, state.selected) {
        listGroups(state.entries, state.selected, 1).firstOrNull()?.entries.orEmpty()
    }
    val cellHeight = monthCellDp(
        rows = rows.size,
        screenDp = LocalConfiguration.current.screenHeightDp.toFloat(),
        headerDp = WEEKDAY_HEADER_HEIGHT.value,
    ).dp

    Column(Modifier.weight(1f)) {
        Column(Modifier.fillMaxWidth().padding(top = Space.sm)) {
            Row(Modifier.fillMaxWidth().height(WEEKDAY_HEADER_HEIGHT)) {
                weekdayNames(state.options.weekends).forEach { name ->
                    Text(
                        text = name,
                        style = MaterialTheme.typography.labelMedium,
                        color = cadence.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            rows.forEach { week ->
                Row(Modifier.fillMaxWidth()) {
                    week.filter { state.options.weekends || !it.isWeekend() }.forEach { day ->
                        MonthCell(
                            day = day,
                            inMonth = YearMonth.from(day) == month,
                            selected = day == state.selected,
                            today = day == state.today,
                            dots = dots[day].orEmpty(),
                            height = cellHeight,
                            onClick = { onSelect(day) },
                        )
                    }
                }
            }
        }
        LazyColumn(Modifier.weight(1f)) {
            item(key = "day-header") {
                DayHeader(date = state.selected, count = dayEntries.size, today = state.selected == state.today)
            }
            if (dayEntries.isEmpty()) {
                item(key = "empty") {
                    Text(
                        text = stringResource(R.string.agenda_empty_day),
                        style = MaterialTheme.typography.bodyMedium,
                        color = cadence.onSurfaceVariant,
                    )
                }
            }
            items(dayEntries, key = { it.rowKey() }) { entry ->
                AgendaEntryRow(
                    entry = entry,
                    checkEvents = state.checkEvents,
                    onToggleEvent = onToggleEvent,
                    onToggleTask = onToggleTask,
                    modifier = Modifier.animateItem(),
                )
            }
            item { NavigationSpacer() }
        }
    }
}

@Composable
private fun RowScope.MonthCell(
    day: LocalDate,
    inMonth: Boolean,
    selected: Boolean,
    today: Boolean,
    dots: List<AgendaEntry>,
    height: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
) {
    val palette = cadence
    val pill = (height - Size.agendaDot - MONTH_DAY_GAP).coerceAtMost(Size.actionSm)
    val description = day.agendaDayDescription()
    Column(
        Modifier
            .weight(1f)
            .height(height)
            .clip(Radius.Chip)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                this.selected = selected
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier
                .size(pill)
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
                    else -> palette.onSurface
                },
                modifier = Modifier.alpha(if (inMonth || selected) 1f else OFF_MONTH_ALPHA),
            )
        }
        Row(
            Modifier.height(Size.agendaDot).padding(top = MONTH_DAY_GAP).alpha(if (inMonth || selected) 1f else OFF_MONTH_ALPHA),
            horizontalArrangement = Arrangement.spacedBy(Space.xs / 2),
        ) {
            dots.forEach { entry ->
                // Même distinction que les repères : carré pour une tâche, rond pour un événement.
                Box(
                    Modifier
                        .size(Size.agendaDot)
                        .clip(if (entry is AgendaEntry.Task) MONTH_TASK_DOT else Radius.Pill)
                        .background(entry.colorArgb?.let { Color(it) } ?: palette.primary),
                )
            }
        }
    }
}

/** Date d'un groupe : opaque pour qu'elle reste lisible, épinglée en haut quand la liste défile dessous. */
@Composable
private fun DayHeader(date: LocalDate, count: Int, today: Boolean, modifier: Modifier = Modifier) {
    val palette = cadence
    Row(
        modifier
            .fillMaxWidth()
            .background(palette.background)
            .padding(top = Space.md, bottom = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = dayLabel(date),
            style = MaterialTheme.typography.titleSmall,
            color = if (today) palette.primary else palette.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(Space.xs))
        Text(count.toString(), style = MaterialTheme.typography.labelLarge, color = palette.outline)
    }
}

/**
 * Vue Liste : les 30 jours à partir du jour choisi (aujourd'hui par défaut), groupés par date, chaque
 * date épinglée en haut pendant que ses éléments défilent. Les jours sans élément n'apparaissent pas.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ColumnScope.ListAgenda(
    state: AgendaUiState,
    onToggleEvent: (EventInstanceKey) -> Unit,
    onToggleTask: (AgendaEntry.Task) -> Unit,
) {
    val groups = remember(state.entries, state.selected) { listGroups(state.entries, state.selected, AGENDA_LIST_DAYS) }
    LazyColumn(Modifier.weight(1f)) {
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
            stickyHeader(key = "day-${group.date}") {
                DayHeader(date = group.date, count = group.entries.size, today = group.date == state.today)
            }
            items(group.entries, key = { "${group.date}-${it.rowKey()}" }) { entry ->
                AgendaEntryRow(
                    entry = entry,
                    checkEvents = state.checkEvents,
                    onToggleEvent = onToggleEvent,
                    onToggleTask = onToggleTask,
                    modifier = Modifier.animateItem(),
                )
            }
        }
        item { NavigationSpacer() }
    }
}

/**
 * Ligne d'élément dans une carte : le repère de 16 dp dans une cible de 48 dp (case carrée pour une
 * tâche, rond pour un événement cochable, point sinon, hexagone pour une habitude), puis le titre et
 * « horaire · source ». Carte opaque, teintée de la couleur de la source comme les blocs de la grille.
 */
@Composable
internal fun AgendaEntryRow(
    entry: AgendaEntry,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
    onToggleTask: (AgendaEntry.Task) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = rememberBlockColors(entry)
    Column(modifier.padding(bottom = Space.sm)) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(Radius.Card)
                .background(Color(colors.fill))
                .eventTouch(entry)
                .heightIn(min = ROW_MIN_HEIGHT),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(Modifier.width(Space.xs))
            Box(
                Modifier.size(Size.touch).markToggle(entry, checkEvents, onToggleEvent, onToggleTask),
                contentAlignment = Alignment.Center,
            ) {
                EntryMark(entry, colors, checkEvents)
            }
            Column(
                Modifier
                    .weight(1f)
                    .padding(end = Space.md, top = Space.md, bottom = Space.md),
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = entry.title.ifBlank { stringResource(R.string.agenda_untitled) },
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color(colors.title),
                    textDecoration = if (entry.done) TextDecoration.LineThrough else null,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = agendaMeta(entry),
                    style = MaterialTheme.typography.labelMedium,
                    color = Color(colors.meta),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
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

/** Clé stable d'une ligne : l'animation de retrait suit l'élément, pas sa position. */
private fun AgendaEntry.rowKey(): String = when (this) {
    is AgendaEntry.Event -> "e-${eventKey.calendarId}-${eventKey.eventId}-${eventKey.instanceBegin}"
    is AgendaEntry.Task -> if (virtual) "t-$uid-$start" else "t-$uid"
    is AgendaEntry.Habit -> "h-$habitId-$start"
}

private fun weekdayNames(weekends: Boolean): List<String> =
    DayOfWeek.entries
        .filter { weekends || it != DayOfWeek.SATURDAY && it != DayOfWeek.SUNDAY }
        .map { it.getDisplayName(TextStyle.NARROW, Locale.FRENCH).uppercase(Locale.FRENCH) }
