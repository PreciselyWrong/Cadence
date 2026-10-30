@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.NextWeek
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.outlined.Weekend
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.quickadd.MonthGrid
import ch.nicolab.cadence.tasks.quickadd.QuickDates
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth

private data class Shortcut(val icon: ImageVector, val label: Int, val date: LocalDate?)

/**
 * Feuille de date commune à la fiche de tâche et à l'ajout rapide : raccourcis, mini calendrier
 * et heure facultative. Chaque geste applique et ferme ; [header] accueille un sélecteur
 * (Début / Échéance) au-dessus du contenu.
 */
@Composable
internal fun TaskDateSheet(
    title: String,
    today: LocalDate,
    date: LocalDate?,
    time: LocalTime?,
    onApply: (LocalDate?, LocalTime?) -> Unit,
    onDismiss: () -> Unit,
    header: (@Composable () -> Unit)? = null,
) {
    var pickingTime by remember { mutableStateOf(false) }
    val apply = { newDate: LocalDate?, newTime: LocalTime? ->
        onApply(newDate, newTime)
        onDismiss()
    }
    CadenceSheet(title = title, subtitle = null, dismiss = onDismiss) {
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            header?.invoke()
            val shortcuts = listOf(
                Shortcut(Icons.Outlined.Today, R.string.tasks_day_today, today),
                Shortcut(Icons.Outlined.WbSunny, R.string.tasks_day_tomorrow, QuickDates.tomorrow(today)),
                Shortcut(Icons.Outlined.Weekend, R.string.tasks_date_weekend, QuickDates.weekend(today)),
                Shortcut(Icons.Outlined.NextWeek, R.string.tasks_date_next_week, QuickDates.nextWeek(today)),
                Shortcut(Icons.Outlined.EventBusy, R.string.tasks_no_due_date, null),
            )
            shortcuts.forEach { shortcut ->
                ShortcutRow(
                    shortcut = shortcut,
                    selected = date == shortcut.date,
                    onClick = { apply(shortcut.date, shortcut.date?.let { time }) },
                )
            }
            MiniCalendar(selected = date, today = today, onPick = { apply(it, time) })
            TimeRow(
                time = time,
                onPick = { pickingTime = true },
                onClear = { apply(date, null) },
            )
            Spacer(Modifier.size(Space.sm))
        }
    }
    if (pickingTime) {
        TaskTimePickerDialog(
            initial = time ?: LocalTime.of(DEFAULT_HOUR, 0),
            onConfirm = {
                pickingTime = false
                apply(date ?: today, it)
            },
            onDismiss = { pickingTime = false },
        )
    }
}

private const val DEFAULT_HOUR = 9

@Composable
private fun ShortcutRow(shortcut: Shortcut, selected: Boolean, onClick: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(if (selected) palette.primaryContainer else palette.containerHigh)
            .clickable(role = Role.Button) {
                haptic.tap()
                onClick()
            }
            .heightIn(min = Size.touch)
            .padding(horizontal = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(shortcut.icon, null, tint = palette.primary, modifier = Modifier.size(Size.icon))
        Spacer(Modifier.width(Space.md))
        Text(
            stringResource(shortcut.label),
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) palette.onPrimaryContainer else palette.onSurface,
        )
        shortcut.date?.let {
            Text(weekdayDate(it), style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
        }
    }
}

@Composable
private fun MiniCalendar(selected: LocalDate?, today: LocalDate, onPick: (LocalDate) -> Unit) {
    val palette = cadence
    var month by remember(selected) { mutableStateOf(YearMonth.from(selected ?: today)) }
    val initials = remember { weekdayInitials() }
    val weeks = remember(month) { MonthGrid.weeks(month) }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .padding(Space.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RoundHeaderButton(
                icon = Icons.AutoMirrored.Outlined.KeyboardArrowLeft,
                contentDescription = stringResource(R.string.tasks_date_prev_month),
                style = HeaderButtonStyle.Plain,
            ) { month = month.minusMonths(1) }
            Text(
                monthTitle(month),
                Modifier.weight(1f),
                style = MaterialTheme.typography.titleSmall,
                color = palette.onSurface,
                textAlign = TextAlign.Center,
            )
            RoundHeaderButton(
                icon = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                contentDescription = stringResource(R.string.tasks_date_next_month),
                style = HeaderButtonStyle.Plain,
            ) { month = month.plusMonths(1) }
        }
        Row(Modifier.fillMaxWidth()) {
            initials.forEach { letter ->
                Text(
                    letter,
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }
        weeks.forEach { week ->
            Row(Modifier.fillMaxWidth()) {
                week.forEach { day ->
                    Box(Modifier.weight(1f).aspectRatio(1f), contentAlignment = Alignment.Center) {
                        if (day != null) DayCell(day, day == selected, day == today, onPick)
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(day: LocalDate, selected: Boolean, isToday: Boolean, onPick: (LocalDate) -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val ring = if (isToday && !selected) Modifier.border(Size.stroke, palette.primary, CircleShape) else Modifier
    Box(
        Modifier
            .size(Size.touch - Space.xs)
            .clip(CircleShape)
            .background(if (selected) palette.primary else Color.Transparent)
            .then(ring)
            .clickable(role = Role.Button) {
                haptic.tap()
                onPick(day)
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            day.dayOfMonth.toString(),
            style = MaterialTheme.typography.bodyMedium,
            color = if (selected) palette.onPrimary else palette.onSurface,
        )
    }
}

@Composable
private fun TimeRow(time: LocalTime?, onPick: () -> Unit, onClear: () -> Unit) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Control)
            .background(palette.containerHigh)
            .clickable(role = Role.Button, onClick = onPick)
            .heightIn(min = Size.touch)
            .padding(start = Space.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Schedule, null, tint = palette.primary, modifier = Modifier.size(Size.icon))
        Spacer(Modifier.width(Space.md))
        Text(stringResource(R.string.tasks_date_time), style = MaterialTheme.typography.bodyLarge, color = palette.onSurface)
        Spacer(Modifier.weight(1f))
        Text(
            time?.let(::wireTime) ?: stringResource(R.string.tasks_add_time),
            style = MaterialTheme.typography.labelLarge,
            color = if (time != null) palette.primary else palette.onSurfaceVariant,
        )
        if (time != null) {
            RoundHeaderButton(
                icon = Icons.Outlined.Close,
                contentDescription = stringResource(R.string.tasks_date_time_remove),
                style = HeaderButtonStyle.Plain,
                onClick = onClear,
            )
        } else {
            Spacer(Modifier.width(Space.lg))
        }
    }
}
