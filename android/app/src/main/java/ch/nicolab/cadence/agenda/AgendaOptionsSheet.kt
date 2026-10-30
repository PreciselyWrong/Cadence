package ch.nicolab.cadence.agenda

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Tag
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Weekend
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarWithDisplay
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.CadenceSwitch
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Demande de la permission de lecture des agendas : renvoie l'action qui ouvre la boîte système et
 * rafraîchit les événements quand elle est accordée.
 */
@Composable
internal fun rememberCalendarPermissionRequest(onGranted: () -> Unit): () -> Unit {
    val latest by rememberUpdatedState(onGranted)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) latest()
    }
    return { launcher.launch(Manifest.permission.READ_CALENDAR) }
}

/**
 * Affichage de l'agenda : options de présentation et choix des agendas visibles. Les agendas sont
 * réglés ici pour la surface Agenda seulement ; Aujourd'hui et le widget ont leurs propres réglages.
 * Sans la permission de lecture, la liste des agendas est remplacée par le bouton qui la demande.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AgendaOptionsSheet(
    options: AgendaOptions,
    calendars: List<CalendarWithDisplay>,
    permissionMissing: Boolean,
    onRequestPermission: () -> Unit,
    onOptionsChange: ((AgendaOptions) -> AgendaOptions) -> Unit,
    onCalendarShown: (CalendarWithDisplay, Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    CadenceSheet(
        title = stringResource(R.string.agenda_display_title),
        subtitle = null,
        dismiss = onDismiss,
        leading = {
            Icon(Icons.Outlined.Tune, contentDescription = null, tint = palette.primary, modifier = Modifier.size(Size.iconLarge))
        },
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
                OptionRow(toggle = toggle, shape = rowGroupShape(index, toggles.size))
            }
        }
        Spacer(Modifier.height(Space.lg))
        Text(
            text = stringResource(R.string.agenda_calendars),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(bottom = Space.sm),
        )
        when {
            permissionMissing -> Column(
                Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                Text(
                    text = stringResource(R.string.agenda_calendar_access_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.onSurfaceVariant,
                )
                PrimaryAction(
                    label = stringResource(R.string.agenda_calendar_access),
                    onClick = onRequestPermission,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            calendars.isEmpty() -> Text(
                text = stringResource(R.string.agenda_calendars_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
            else -> Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
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

/**
 * Ligne à interrupteur : le libellé prend la place restante (poids 1) et une marge le sépare de
 * l'interrupteur, donc un titre long passe à la ligne au lieu de le recouvrir.
 */
@Composable
private fun OptionRow(toggle: OptionToggle, shape: Shape) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(palette.card)
            .clickable(role = Role.Switch) {
                haptic.tap()
                toggle.onChange(!toggle.checked)
            }
            .heightIn(min = Size.settingRow)
            .padding(horizontal = Space.lg, vertical = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(toggle.icon, contentDescription = null, tint = palette.primary, modifier = Modifier.size(Size.iconLarge))
        Spacer(Modifier.width(Space.lg))
        Column(Modifier.weight(1f)) {
            Text(
                text = stringResource(toggle.titleRes),
                style = MaterialTheme.typography.bodyLarge,
                color = palette.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            toggle.hintRes?.let {
                Text(
                    text = stringResource(it),
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(Space.lg))
        CadenceSwitch(checked = toggle.checked, onCheckedChange = toggle.onChange)
    }
}

private class OptionToggle(
    val titleRes: Int,
    val hintRes: Int?,
    val icon: ImageVector,
    val checked: Boolean,
    val onChange: (Boolean) -> Unit,
)
