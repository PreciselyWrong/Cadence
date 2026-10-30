package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.planning.FocusBlock
import ch.nicolab.cadence.tasks.planning.PlanningSettings
import ch.nicolab.cadence.tasks.planning.PlanningSettingsCodec
import ch.nicolab.cadence.tasks.planning.PlanningStore
import ch.nicolab.cadence.tasks.planning.WorkingHours
import java.time.DayOfWeek
import java.time.LocalTime
import java.time.format.TextStyle
import java.util.Locale

private const val STEP_MINUTES = 30L
private const val LAST_START_MINUTE = 23 * 60 + 30

/**
 * Réglages › Planification : heures et jours de travail, heure de fin de journée, plages protégées.
 * Contenu seul, à poser dans une sous-page de Réglages (voir `SettingsRegistry`).
 */
@Composable
fun PlanningSettingsPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val store = remember(context) { PlanningStore.of(context) }
    val settings by store.settings.collectAsStateWithLifecycle()
    val defaultFocusName = stringResource(R.string.planning_settings_focus_default)

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(
            stringResource(R.string.planning_settings_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
        )
        Panel {
            Text(stringResource(R.string.planning_settings_hours), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            TimeStepper(stringResource(R.string.planning_settings_start), settings.hours.start) { start ->
                store.update { it.copy(hours = it.hours.copy(start = start, end = maxOf(it.hours.end, start.plusMinutes(STEP_MINUTES)))) }
            }
            TimeStepper(stringResource(R.string.planning_settings_end), settings.hours.end) { end ->
                store.update { it.copy(hours = it.hours.copy(end = end, start = minOf(it.hours.start, end.minusMinutes(STEP_MINUTES)))) }
            }
            Spacer(Modifier.height(Space.sm))
            Text(stringResource(R.string.planning_settings_days), style = MaterialTheme.typography.labelLarge, color = cadence.onSurfaceVariant)
            Spacer(Modifier.height(Space.xs))
            DayToggles(settings.hours.days) { days -> store.update { it.copy(hours = it.hours.copy(days = days)) } }
        }
        Panel {
            Text(stringResource(R.string.planning_settings_shutdown), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            TimeStepper(stringResource(R.string.planning_settings_shutdown), settings.shutdown) { time ->
                store.update { it.copy(shutdown = time) }
            }
            Text(
                stringResource(R.string.planning_settings_shutdown_hint),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
        }
        Panel {
            Text(stringResource(R.string.planning_settings_focus), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            Text(
                stringResource(R.string.planning_settings_focus_hint),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
            if (settings.focusBlocks.isEmpty()) {
                Spacer(Modifier.height(Space.sm))
                Text(
                    stringResource(R.string.planning_settings_focus_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.outline,
                )
            }
        }
        settings.focusBlocks.forEachIndexed { index, block ->
            FocusBlockPanel(
                block = block,
                onChange = { changed -> store.update { it.replaceFocus(index, changed) } },
                onRemove = { store.update { it.copy(focusBlocks = it.focusBlocks.filterIndexed { i, _ -> i != index }) } },
            )
        }
        SecondaryAction(stringResource(R.string.planning_settings_focus_add), Modifier.fillMaxWidth()) {
            store.update {
                it.copy(
                    focusBlocks = it.focusBlocks + FocusBlock(
                        label = defaultFocusName,
                        start = LocalTime.of(14, 0),
                        end = LocalTime.of(16, 0),
                        days = it.hours.days,
                    ),
                )
            }
        }
    }
}

private fun PlanningSettings.replaceFocus(index: Int, block: FocusBlock): PlanningSettings =
    copy(focusBlocks = focusBlocks.mapIndexed { i, old -> if (i == index) block else old })

@Composable
private fun FocusBlockPanel(block: FocusBlock, onChange: (FocusBlock) -> Unit, onRemove: () -> Unit) {
    Panel {
        CadenceField(
            value = block.label,
            onValue = { onChange(block.copy(label = it)) },
            label = stringResource(R.string.planning_settings_focus_name),
        )
        TimeStepper(stringResource(R.string.planning_settings_start), block.start) { start ->
            onChange(block.copy(start = start, end = maxOf(block.end, start.plusMinutes(STEP_MINUTES))))
        }
        TimeStepper(stringResource(R.string.planning_settings_end), block.end) { end ->
            onChange(block.copy(end = end, start = minOf(block.start, end.minusMinutes(STEP_MINUTES))))
        }
        Spacer(Modifier.height(Space.sm))
        DayToggles(block.days) { onChange(block.copy(days = it)) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TertiaryAction(stringResource(R.string.planning_settings_focus_remove, block.label), tint = cadence.error, onClick = onRemove)
        }
    }
}

/** Heure réglable par pas de 30 minutes, avec des cibles tactiles complètes. */
@Composable
private fun TimeStepper(label: String, time: LocalTime, onChange: (LocalTime) -> Unit) {
    val earlier = stringResource(R.string.planning_settings_earlier, label)
    val later = stringResource(R.string.planning_settings_later, label)
    Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = Size.touch), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, modifier = Modifier.weight(1f))
        IconButton(
            onClick = { onChange(time.minusMinutes(STEP_MINUTES).takeIf { it < time } ?: time) },
            modifier = Modifier.size(Size.touch),
        ) {
            Icon(Icons.Outlined.Remove, contentDescription = earlier, tint = cadence.onSurface)
        }
        Text(
            PlanningSettingsCodec.encodeTime(time),
            style = MaterialTheme.typography.titleMedium,
            color = cadence.onSurface,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(Size.touch + Space.md),
        )
        IconButton(
            onClick = { onChange(if (time.toSecondOfDay() / 60 >= LAST_START_MINUTE) time else time.plusMinutes(STEP_MINUTES)) },
            modifier = Modifier.size(Size.touch),
        ) {
            Icon(Icons.Outlined.Add, contentDescription = later, tint = cadence.onSurface)
        }
    }
}

/** Sept cases lundi → dimanche ; une case pleine est un jour retenu. */
@Composable
private fun DayToggles(days: Set<DayOfWeek>, onChange: (Set<DayOfWeek>) -> Unit) {
    val palette = cadence
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
        DayOfWeek.entries.forEach { day ->
            val on = day in days
            val full = day.getDisplayName(TextStyle.FULL, Locale.FRENCH)
            Box(
                Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = Size.touch)
                    .clip(Radius.Chip)
                    .background(if (on) palette.primary else palette.containerHigh)
                    .clickable { onChange(if (on) days - day else days + day) }
                    .semantics {
                        role = Role.Checkbox
                        selected = on
                        contentDescription = full
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    day.getDisplayName(TextStyle.NARROW, Locale.FRENCH).uppercase(Locale.FRENCH),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (on) palette.onPrimary else palette.onSurface,
                )
            }
        }
    }
}
