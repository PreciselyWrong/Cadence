package ch.nicolab.cadence.agenda

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Tag
import androidx.compose.material.icons.outlined.Weekend
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingToggleRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Affichage de l'agenda : options de présentation et choix des agendas visibles. Les agendas sont
 * réglés ici pour la surface Agenda seulement ; Aujourd'hui et le widget ont leurs propres réglages.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AgendaOptionsSheet(
    options: AgendaOptions,
    calendars: List<CalendarWithDisplay>,
    onOptionsChange: ((AgendaOptions) -> AgendaOptions) -> Unit,
    onCalendarShown: (CalendarWithDisplay, Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    CadenceSheet(
        title = stringResource(R.string.agenda_display_title),
        subtitle = null,
        dismiss = onDismiss,
    ) {
        val toggles = listOf(
            OptionToggle(R.string.agenda_option_timed_tasks, R.string.agenda_option_timed_tasks_hint, Icons.Outlined.Schedule, options.timedTasks) {
                onOptionsChange { o -> o.copy(timedTasks = it) }
            },
            OptionToggle(R.string.agenda_option_habits, null, Icons.Outlined.Repeat, options.habits) {
                onOptionsChange { o -> o.copy(habits = it) }
            },
            OptionToggle(R.string.agenda_option_done, null, Icons.Outlined.DoneAll, options.showDone) {
                onOptionsChange { o -> o.copy(showDone = it) }
            },
            OptionToggle(R.string.agenda_option_weekends, null, Icons.Outlined.Weekend, options.weekends) {
                onOptionsChange { o -> o.copy(weekends = it) }
            },
            OptionToggle(R.string.agenda_option_week_numbers, null, Icons.Outlined.Tag, options.weekNumbers) {
                onOptionsChange { o -> o.copy(weekNumbers = it) }
            },
        )
        RowGroup {
            toggles.forEachIndexed { index, toggle ->
                SettingToggleRow(
                    title = stringResource(toggle.titleRes),
                    checked = toggle.checked,
                    onCheckedChange = toggle.onChange,
                    icon = toggle.icon,
                    subtitle = toggle.hintRes?.let { stringResource(it) },
                    shape = rowGroupShape(index, toggles.size),
                )
            }
        }
        Spacer(Modifier.height(Space.lg))
        Text(
            text = stringResource(R.string.agenda_calendars),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
            modifier = Modifier.padding(bottom = Space.sm),
        )
        if (calendars.isEmpty()) {
            Text(
                text = stringResource(R.string.agenda_calendars_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
            )
        } else {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                calendars.forEach { item ->
                    val shown = item.display.agenda
                    ChoiceChip(
                        label = item.calendar.displayName,
                        selected = shown,
                        accent = Color(item.calendar.colorArgb),
                        leadingIcon = if (shown) Icons.Outlined.Check else null,
                        onClick = { onCalendarShown(item, !shown) },
                    )
                }
            }
        }
    }
}

private class OptionToggle(
    val titleRes: Int,
    val hintRes: Int?,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val checked: Boolean,
    val onChange: (Boolean) -> Unit,
)
