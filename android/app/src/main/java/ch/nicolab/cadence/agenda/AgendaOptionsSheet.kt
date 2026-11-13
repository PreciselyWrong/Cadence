package ch.nicolab.cadence.agenda

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
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
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.settings.CalendarChoices
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.CadenceSwitch
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
 * Affichage de l'agenda : options de présentation propres à cette vue, puis la liste des agendas,
 * la même que Réglages › Agendas ([CalendarChoices]), et le lien vers cette page pour les réglages
 * communs (cocher un événement, événements masqués).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AgendaOptionsSheet(
    options: AgendaOptions,
    onOptionsChange: ((AgendaOptions) -> AgendaOptions) -> Unit,
    onOpenCalendarSettings: () -> Unit,
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
        // La feuille s'arrête à la hauteur de l'écran : sans défilement, les agendas du bas restaient hors d'atteinte.
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f, fill = false)
                .verticalScroll(rememberScrollState()),
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
            CalendarChoices()
            Spacer(Modifier.height(Space.md))
            RowGroup {
                SettingRow(
                    title = stringResource(R.string.agenda_all_calendar_settings),
                    subtitle = stringResource(R.string.agenda_all_calendar_settings_hint),
                    icon = Icons.Outlined.Settings,
                    shape = rowGroupShape(0, 1),
                    onClick = onOpenCalendarSettings,
                )
            }
            Spacer(Modifier.height(Space.lg))
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
