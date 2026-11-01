package ch.nicolab.cadence.agenda

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val PANEL_MONTH_LABEL: DateTimeFormatter = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.FRENCH)
private val PANEL_CELL_HEIGHT = 40.dp
private const val OFF_MONTH_ALPHA = 0.38f

/**
 * Calendrier du mois, déplié sous l'en-tête par son bouton : un jour touché devient le jour affiché
 * et referme le panneau. Le défilement de l'agenda ne l'ouvre ni ne le ferme.
 */
@Composable
internal fun AgendaCalendarPanel(
    visible: Boolean,
    month: YearMonth,
    selected: LocalDate,
    today: LocalDate,
    weekends: Boolean,
    onBrowse: (Int) -> Unit,
    onPick: (LocalDate) -> Unit,
) {
    AnimatedVisibility(visible = visible, label = "calendarPanel") {
        val palette = cadence
        val rows = monthGrid(month).chunked(DayOfWeek.entries.size)
        Column(
            Modifier
                .fillMaxWidth()
                .padding(top = Space.sm)
                .clip(Radius.Chip)
                .background(palette.card)
                .padding(horizontal = Space.sm, vertical = Space.sm),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PanelArrow(Icons.Outlined.ChevronLeft, stringResource(R.string.agenda_calendar_previous_month)) { onBrowse(-1) }
                Text(
                    text = month.format(PANEL_MONTH_LABEL).replaceFirstChar { it.titlecase(Locale.FRENCH) },
                    style = MaterialTheme.typography.titleSmall,
                    color = palette.onSurface,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                PanelArrow(Icons.Outlined.ChevronRight, stringResource(R.string.agenda_calendar_next_month)) { onBrowse(1) }
            }
            Row(Modifier.fillMaxWidth()) {
                DayOfWeek.entries.filter { weekends || it != DayOfWeek.SATURDAY && it != DayOfWeek.SUNDAY }.forEach {
                    Text(
                        text = it.getDisplayName(TextStyle.NARROW, Locale.FRENCH).uppercase(Locale.FRENCH),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            rows.forEach { week ->
                Row(Modifier.fillMaxWidth()) {
                    week.filter { weekends || !it.isWeekend() }.forEach { day ->
                        PanelDay(
                            day = day,
                            inMonth = YearMonth.from(day) == month,
                            selected = day == selected,
                            today = day == today,
                            modifier = Modifier.weight(1f),
                            onClick = { onPick(day) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PanelArrow(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(Size.headerButton)
            .clip(Radius.Pill)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = cadence.onSurface, modifier = Modifier.size(Size.iconLarge))
    }
}

@Composable
private fun PanelDay(
    day: LocalDate,
    inMonth: Boolean,
    selected: Boolean,
    today: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val palette = cadence
    val description = day.agendaDayDescription()
    Box(
        modifier
            .height(PANEL_CELL_HEIGHT)
            .clip(Radius.Chip)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                this.selected = selected
            },
        contentAlignment = Alignment.Center,
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
                    else -> palette.onSurface
                },
                modifier = Modifier.alpha(if (inMonth || selected) 1f else OFF_MONTH_ALPHA),
            )
        }
    }
}
