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
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.planning.FocusBlock
import ch.nicolab.cadence.tasks.planning.FocusException
import ch.nicolab.cadence.tasks.planning.PlanningSettings
import ch.nicolab.cadence.tasks.planning.PlanningSettingsCodec
import ch.nicolab.cadence.tasks.planning.PlanningStore
import ch.nicolab.cadence.tasks.planning.WorkingHours
import ch.nicolab.cadence.tasks.ui.weekdayDate
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.TextStyle
import java.util.Locale

private const val STEP_MINUTES = 30L
private const val LAST_START_MINUTE = 23 * 60 + 30

/**
 * Réglages › Planification : heures et jours de travail, heure de fin de journée, plages protégées et leurs
 * exceptions (vacances, jour de congé). Les plages et exceptions sont celles du serveur, partagées avec le web.
 * Contenu seul, à poser dans une sous-page de Réglages (voir `SettingsRegistry`).
 */
@Composable
fun PlanningSettingsPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val store = remember(context) { PlanningStore.of(context) }
    val focus = remember(context) { TasksGraph.focus(context) }
    val settings by store.settings.collectAsStateWithLifecycle()
    val defaultFocusName = stringResource(R.string.planning_settings_focus_default)
    val saveError by focus.error.collectAsStateWithLifecycle()
    val today = LocalDate.now()

    // Gardé tout de suite sur l'appareil ; le dépôt l'envoie au serveur, même une fois la page quittée.
    fun saveFocus(blocks: List<FocusBlock>, exceptions: List<FocusException>) = focus.edit(blocks, exceptions)

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
                onChange = { changed ->
                    val current = store.settings.value
                    saveFocus(current.focusBlocks.mapIndexed { i, old -> if (i == index) changed else old }, current.focusExceptions)
                },
                onRemove = {
                    val current = store.settings.value
                    saveFocus(current.focusBlocks.filterIndexed { i, _ -> i != index }, current.withoutBlock(block.id))
                },
            )
        }
        SecondaryAction(stringResource(R.string.planning_settings_focus_add), Modifier.fillMaxWidth()) {
            saveFocus(
                settings.focusBlocks + FocusBlock(
                    label = defaultFocusName,
                    start = LocalTime.of(14, 0),
                    end = LocalTime.of(16, 0),
                    days = settings.hours.days.ifEmpty { WorkingHours.DEFAULT_DAYS },
                ),
                settings.focusExceptions,
            )
        }
        saveError?.let {
            Text(
                stringResource(R.string.planning_settings_focus_error, it),
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.error,
            )
        }
        // Une exception ne nomme qu'une plage déjà connue du serveur.
        val namedBlocks = settings.focusBlocks.filter { it.id.isNotEmpty() }
        val upcoming = settings.focusExceptions.filterNot { it.end.isBefore(today) }
        Panel {
            Text(stringResource(R.string.planning_settings_exceptions), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            Text(
                stringResource(R.string.planning_settings_exceptions_hint),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
            if (upcoming.isEmpty()) {
                Spacer(Modifier.height(Space.sm))
                Text(
                    stringResource(R.string.planning_settings_exceptions_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = cadence.outline,
                )
            }
        }
        upcoming.forEach { exception ->
            // Une exception enregistrée se retrouve par son id ; une nouvelle, par sa place.
            val index = settings.focusExceptions.indexOf(exception)
            fun replace(changed: FocusException?) {
                val current = store.settings.value.focusExceptions
                val at = if (exception.id.isNotEmpty()) current.indexOfFirst { it.id == exception.id } else index
                if (at !in current.indices) return
                saveFocus(store.settings.value.focusBlocks, current.mapIndexedNotNull { i, old -> if (i == at) changed else old })
            }
            FocusExceptionPanel(
                exception = exception,
                blocks = namedBlocks,
                onChange = { replace(it) },
                onRemove = { replace(null) },
            )
        }
        if (namedBlocks.isNotEmpty()) {
            SecondaryAction(stringResource(R.string.planning_settings_exception_add), Modifier.fillMaxWidth()) {
                saveFocus(settings.focusBlocks, settings.focusExceptions + FocusException(today, today))
            }
        }
    }
}

/** Les exceptions une fois la plage [id] supprimée : celle qui ne libérait qu'elle disparaît. */
private fun PlanningSettings.withoutBlock(id: String): List<FocusException> = focusExceptions.mapNotNull { exception ->
    val ids = exception.blockIds ?: return@mapNotNull exception
    (ids - id).takeIf { it.isNotEmpty() }?.let { exception.copy(blockIds = it) }
}

@Composable
private fun FocusExceptionPanel(
    exception: FocusException,
    blocks: List<FocusBlock>,
    onChange: (FocusException) -> Unit,
    onRemove: () -> Unit,
) {
    Panel {
        CadenceField(
            value = exception.label,
            onValue = { onChange(exception.copy(label = it)) },
            label = stringResource(R.string.planning_settings_exception_label),
        )
        DateStepper(stringResource(R.string.planning_settings_exception_start), exception.start) { start ->
            onChange(exception.copy(start = start, end = maxOf(exception.end, start)))
        }
        DateStepper(stringResource(R.string.planning_settings_exception_end), exception.end, earliest = exception.start) { end ->
            onChange(exception.copy(end = end))
        }
        if (blocks.size > 1) {
            Spacer(Modifier.height(Space.sm))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                ToggleChip(stringResource(R.string.planning_settings_exception_all), exception.blockIds == null, Modifier.weight(1f)) {
                    onChange(exception.copy(blockIds = null))
                }
                blocks.forEach { block ->
                    val on = exception.blockIds?.contains(block.id) == true
                    ToggleChip(block.label.ifBlank { PlanningSettingsCodec.encodeTime(block.start) }, on, Modifier.weight(1f)) {
                        val chosen = (exception.blockIds.orEmpty()).let { if (on) it - block.id else it + block.id }
                        onChange(exception.copy(blockIds = chosen.ifEmpty { null }))
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TertiaryAction(stringResource(R.string.planning_settings_exception_remove), tint = cadence.error, onClick = onRemove)
        }
    }
}

/** Date réglable jour par jour, jamais avant [earliest]. */
@Composable
private fun DateStepper(label: String, date: LocalDate, earliest: LocalDate? = null, onChange: (LocalDate) -> Unit) {
    val before = stringResource(R.string.planning_settings_day_before, label)
    val after = stringResource(R.string.planning_settings_day_after, label)
    Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = Size.touch), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, modifier = Modifier.weight(1f))
        IconButton(
            onClick = { date.minusDays(1).takeIf { earliest == null || !it.isBefore(earliest) }?.let(onChange) },
            modifier = Modifier.size(Size.touch),
        ) {
            Icon(Icons.Outlined.Remove, contentDescription = before, tint = cadence.onSurface)
        }
        Text(
            weekdayDate(date),
            style = MaterialTheme.typography.titleMedium,
            color = cadence.onSurface,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(Size.touch * 2 + Space.md),
        )
        IconButton(onClick = { onChange(date.plusDays(1)) }, modifier = Modifier.size(Size.touch)) {
            Icon(Icons.Outlined.Add, contentDescription = after, tint = cadence.onSurface)
        }
    }
}

@Composable
private fun ToggleChip(label: String, on: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val palette = cadence
    Box(
        modifier
            .defaultMinSize(minHeight = Size.touch)
            .clip(Radius.Chip)
            .background(if (on) palette.primary else palette.containerHigh)
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Checkbox
                selected = on
            }
            .padding(horizontal = Space.xs),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (on) palette.onPrimary else palette.onSurface,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
    }
}

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
            onChange(block.copy(end = end, start = minOf(block.start, stepDown(end))))
        }
        Spacer(Modifier.height(Space.sm))
        // Une plage garde au moins un jour (le serveur refuse une plage sans jour).
        DayToggles(block.days) { days -> if (days.isNotEmpty()) onChange(block.copy(days = days)) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TertiaryAction(stringResource(R.string.planning_settings_focus_remove, block.label), tint = cadence.error, onClick = onRemove)
        }
    }
}

/**
 * Pas de 30 minutes vers le bas, recalé sur la grille : une fin à minuit (23:59 sur le téléphone, 24:00 sur le
 * serveur) donne 23:30, jamais 23:29 que le serveur refuserait.
 */
private fun stepDown(time: LocalTime): LocalTime {
    val offGrid = (time.toSecondOfDay() / 60 % STEP_MINUTES).toLong()
    return time.withSecond(0).withNano(0).minusMinutes(if (offGrid != 0L) offGrid else STEP_MINUTES)
}

/** Heure réglable par pas de 30 minutes, avec des cibles tactiles complètes. */
@Composable
private fun TimeStepper(label: String, time: LocalTime, onChange: (LocalTime) -> Unit) {
    val earlier = stringResource(R.string.planning_settings_earlier, label)
    val later = stringResource(R.string.planning_settings_later, label)
    Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = Size.touch), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, modifier = Modifier.weight(1f))
        IconButton(
            onClick = { onChange(stepDown(time).takeIf { it < time } ?: time) },
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
