package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.StripDay
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskOverviews
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private const val MAX_DOTS = 3

/**
 * Les 7 prochains jours : une bande de jours avec leurs points, puis un en-tête par jour. Toucher
 * un jour de la bande ne montre que lui ; le retoucher les montre tous.
 */
@Composable
internal fun UpcomingTab(
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val upcoming by viewModel.upcoming.collectAsStateWithLifecycle()
    val state by viewModel.today.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    var selectedEpochDay by rememberSaveable { mutableStateOf<Long?>(null) }
    val today = moment.today
    val selected = selectedEpochDay?.let(LocalDate::ofEpochDay)?.takeIf { it in today..today.plusDays(6) }
    val strip = remember(today, state.today, upcoming) { TaskOverviews.weekStrip(today, state.today.size, upcoming) }
    val days: Map<LocalDate, List<TaskItem>> = when {
        selected == null -> upcoming
        selected == today -> if (state.today.isEmpty()) emptyMap() else mapOf(today to state.today)
        else -> upcoming.filterKeys { it == selected }
    }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        item(key = "strip") {
            WeekStrip(
                days = strip,
                today = today,
                selected = selected,
                onSelect = { day -> selectedEpochDay = if (day == selected) null else day.toEpochDay() },
                modifier = Modifier.padding(bottom = Space.sm),
            )
        }
        if (days.isEmpty()) {
            item(key = "empty") {
                EmptyState(if (selected != null) R.string.tasks_strip_day_empty else R.string.tasks_upcoming_empty)
            }
        }
        days.forEach { (date, tasks) ->
            item(key = "day-$date") {
                SectionHeader(title = sectionDayTitle(date, today), count = tasks.size)
            }
            taskRows(tasks, projectNames, projectColors, moment, viewModel, onOpen)
        }
    }
}

/** « Demain · samedi 31 », « lundi 2 nov. » : un jour proche garde son mot relatif et gagne sa date. */
@Composable
private fun sectionDayTitle(date: LocalDate, today: LocalDate): String {
    val label = dayLabel(date, today)
    return if (date == today || date == today.plusDays(1) || date == today.minusDays(1)) {
        "$label · ${date.format(DateTimeFormatter.ofPattern("EEEE d", tasksLocale))}"
    } else {
        label
    }
}

@Composable
private fun WeekStrip(
    days: List<StripDay>,
    today: LocalDate,
    selected: LocalDate?,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
        days.forEach { day ->
            StripCell(day, isToday = day.date == today, isSelected = day.date == selected, onSelect, Modifier.weight(1f))
        }
    }
}

@Composable
private fun StripCell(
    day: StripDay,
    isToday: Boolean,
    isSelected: Boolean,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val weekday = day.date.format(DateTimeFormatter.ofPattern("EEEEE", tasksLocale)).uppercase(tasksLocale)
    val description = stringResource(
        R.string.tasks_strip_day_description,
        day.date.format(DateTimeFormatter.ofPattern("EEEE d MMMM", tasksLocale)),
        day.count,
    )
    val shape = Radius.Control
    Column(
        modifier
            .clip(shape)
            .background(if (isSelected) palette.primaryContainer.copy(alpha = Glass.CountAlpha) else palette.card)
            .border(
                BorderStroke(Size.hairline, if (isSelected || isToday) palette.primary.copy(alpha = 0.45f) else palette.outlineVariant),
                shape,
            )
            .clickable { onSelect(day.date) }
            .semantics(mergeDescendants = true) {
                role = Role.Button
                this.selected = isSelected
                contentDescription = description
            }
            .padding(vertical = Space.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(weekday, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
        Text(
            day.date.dayOfMonth.toString(),
            style = MaterialTheme.typography.titleMedium,
            color = if (isToday) palette.primary else palette.onSurface,
        )
        Spacer(Modifier.height(Space.xs))
        Row(Modifier.height(Size.agendaDot), horizontalArrangement = Arrangement.spacedBy(Space.groupGap)) {
            repeat(day.count.coerceAtMost(MAX_DOTS)) {
                Box(Modifier.size(Size.agendaDot).clip(CircleShape).background(palette.primary))
            }
        }
    }
}
