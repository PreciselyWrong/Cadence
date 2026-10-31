package ch.nicolab.cadence.habits

import ch.nicolab.cadence.ui.longFrench
import ch.nicolab.cadence.ui.TimePickerDialog24
import ch.nicolab.cadence.ui.FrenchDatePickerDialog
import ch.nicolab.cadence.designsystem.components.ActionRow
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ErrorText
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEntrySource
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.health.HealthConnectGateway
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.shortFrench
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit

/** Une saisie corrigeable : sa date civile, son heure et sa valeur, sans carte imbriquée. */
@Composable
internal fun EntryRow(entry: HabitEntry, goalType: GoalType, unit: MeasurementUnit?, onClick: () -> Unit) {
    val palette = cadence
    val context = LocalContext.current
    val healthPackage = HabitEntrySource.healthConnectPackage(entry.source)
    val healthSource = remember(entry.source) {
        healthPackage?.let { HealthConnectGateway(context).applicationLabel(it) }
    }
    val durationSource = when {
        goalType != GoalType.DURATION -> null
        healthPackage != null -> stringResource(R.string.health_connect_entry_source, healthSource ?: healthPackage)
        entry.source == "TIMER" -> stringResource(R.string.health_connect_entry_timer)
        else -> stringResource(R.string.health_connect_entry_manual)
    }
    Row(
        Modifier.fillMaxWidth().clip(Radius.Control).clickable(onClick = onClick).padding(vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(Modifier.weight(1f)) {
            Text(entry.localDate.shortFrench(), style = MaterialTheme.typography.bodyMedium, color = palette.onSurface)
            Text(
                // La note prime sur l'heure : c'est elle qui rappelle de quoi il s'agissait.
                entry.note ?: entry.occurredAt.atZone(entry.observedZoneId).toLocalTime()
                    .truncatedTo(ChronoUnit.MINUTES).toString(),
                style = MaterialTheme.typography.bodySmall,
                color = palette.outline,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            durationSource?.let { sourceLabel ->
                Text(
                    sourceLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (healthPackage != null) palette.primary else palette.outline,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            HabitFormatter.formatValue(entry.valueMinor, goalType, unit),
            style = MaterialTheme.typography.titleMedium,
            color = palette.onSurface,
        )
    }
}

/** Nombre de saisies proposées directement; l'ensemble reste corrigeable par défilement. */
internal const val VISIBLE_ENTRIES = 12

/**
 * Correction d'une saisie. La date et l'heure sont lues dans le fuseau enregistré avec la
 * saisie, pour qu'une correction passée reste attribuée à la bonne période.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun EntryEditor(
    entry: HabitEntry,
    goalType: GoalType,
    unit: MeasurementUnit?,
    accent: Color,
    dismiss: () -> Unit,
    save: (Long, LocalDate, LocalTime, String) -> Unit,
    delete: () -> Unit,
    busy: Boolean,
    saveError: String?,
    occurrenceOnly: Boolean,
) {
    val palette = cadence
    val scale = unit?.scaleToCanonical ?: 1L
    val zoned = remember(entry.id) { entry.occurredAt.atZone(entry.observedZoneId) }
    var value by rememberSaveable(entry.id) { mutableStateOf((entry.valueMinor / scale).toString()) }
    var date by rememberSaveable(entry.id) { mutableStateOf(entry.localDate) }
    var time by rememberSaveable(entry.id) { mutableStateOf(zoned.toLocalTime().truncatedTo(ChronoUnit.MINUTES)) }
    var note by rememberSaveable(entry.id) { mutableStateOf(entry.note.orEmpty()) }
    var error by remember(entry.id) { mutableStateOf<String?>(null) }
    var dateOpen by remember { mutableStateOf(false) }
    var timeOpen by remember { mutableStateOf(false) }
    val badValue = stringResource(R.string.entry_error_value)
    val imported = HabitEntrySource.isHealthConnect(entry.source)

    CadenceSheet(
        title = stringResource(R.string.entry_edit_title),
        subtitle = stringResource(R.string.entry_edit_subtitle),
        dismiss = dismiss,
    ) {
        if (!occurrenceOnly) {
            CadenceField(value, { value = it.filter(Char::isDigit) }, stringResource(R.string.entry_value_label), suffix = unit?.symbol, accent = accent, numeric = true)
            Spacer(Modifier.height(Space.md))
        }
        // Date et heure se choisissent au calendrier et au cadran : jamais d'écriture ISO à taper.
        ActionRow(Icons.Outlined.DateRange, stringResource(R.string.entry_date_value, date.longFrench()), accent) {
            if (!busy) dateOpen = true
        }
        Spacer(Modifier.height(Space.sm))
        ActionRow(Icons.Outlined.AccessTime, stringResource(R.string.entry_time_value, time.toString()), accent) {
            if (!busy) timeOpen = true
        }
        Spacer(Modifier.height(Space.md))
        CadenceField(note, { note = it }, stringResource(R.string.entry_note_label), accent = accent)
        Spacer(Modifier.height(Space.sm))
        Text(
            stringResource(R.string.entry_zone_notice, entry.observedZoneId.id),
            style = MaterialTheme.typography.bodySmall,
            color = palette.outline,
        )
        if (imported) {
            Spacer(Modifier.height(Space.sm))
            Text(
                stringResource(R.string.health_connect_entry_detach_notice),
                style = MaterialTheme.typography.bodySmall,
                color = palette.onSurfaceVariant,
            )
        }
        (error ?: saveError)?.let { Spacer(Modifier.height(Space.md)); ErrorText(it) }
        Spacer(Modifier.height(Space.xl))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            SecondaryAction(stringResource(R.string.form_btn_cancel), Modifier.weight(1f), onClick = dismiss)
            PrimaryAction(stringResource(if (busy) R.string.abstinence_saving else R.string.form_btn_save), Modifier.weight(1f), accent = accent, enabled = !busy) {
                val amount = if (occurrenceOnly) entry.valueMinor else value.toLongOrNull() ?: 0
                if (amount <= 0) {
                    error = badValue
                } else {
                    error = null
                    // Une correction de note ne doit pas arrondir l'instant d'origine à la minute.
                    val observedTime = zoned.toLocalTime()
                    val correctedTime = if (time == observedTime.truncatedTo(ChronoUnit.MINUTES)) observedTime else time
                    save(if (occurrenceOnly) entry.valueMinor else amount * scale, date, correctedTime, note)
                }
            }
        }
        Spacer(Modifier.height(Space.sm))
        TertiaryAction(
            stringResource(if (imported) R.string.health_connect_entry_ignore else R.string.entry_delete),
            Modifier.fillMaxWidth(),
            onClick = { if (!busy) { error = null; delete() } },
        )
    }
    if (dateOpen) {
        FrenchDatePickerDialog(
            initial = date,
            title = stringResource(R.string.entry_date_title),
            confirmLabel = stringResource(R.string.abst_setup_date_confirm),
            latest = LocalDate.now(entry.observedZoneId),
            onDismiss = { dateOpen = false },
        ) {
            date = it
            dateOpen = false
        }
    }
    if (timeOpen) {
        TimePickerDialog24(
            initial = time,
            title = stringResource(R.string.entry_time_title),
            confirmLabel = stringResource(R.string.abst_setup_time_confirm),
            onDismiss = { timeOpen = false },
        ) {
            time = it
            timeOpen = false
        }
    }
}
