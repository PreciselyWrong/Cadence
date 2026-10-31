package ch.nicolab.cadence.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DatePickerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.theme.Space
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.util.Locale

/**
 * Calendrier Material en français, quelle que soit la langue de l'appareil. Les jours après
 * [latest] ne sont pas sélectionnables.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FrenchDatePickerDialog(
    initial: LocalDate,
    title: String,
    confirmLabel: String,
    latest: LocalDate?,
    onDismiss: () -> Unit,
    onConfirm: (LocalDate) -> Unit,
) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val calendarConfiguration = remember(configuration) {
        Configuration(configuration).apply { setLocale(Locale.FRENCH) }
    }
    val calendarContext = remember(context, calendarConfiguration) {
        context.createConfigurationContext(calendarConfiguration)
    }
    val state = remember(initial, latest) {
        DatePickerState(
            locale = Locale.FRENCH,
            initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    latest == null || Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate() <= latest
            },
        )
    }
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(enabled = state.selectedDateMillis != null, onClick = {
                state.selectedDateMillis?.let { onConfirm(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
            }) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.form_btn_cancel)) } },
    ) {
        // Le dialogue recrée ses locaux : la langue se fournit dans son contenu.
        CompositionLocalProvider(
            LocalContext provides calendarContext,
            LocalConfiguration provides calendarConfiguration,
            LocalResources provides calendarContext.resources,
        ) {
            DatePicker(state = state, title = { Text(title, Modifier.padding(Space.lg)) })
        }
    }
}

/** Cadran horaire sur 24 h. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TimePickerDialog24(
    initial: LocalTime,
    title: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: (LocalTime) -> Unit,
) {
    val state = rememberTimePickerState(initial.hour, initial.minute, is24Hour = true)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { TimePicker(state) },
        confirmButton = { TextButton(onClick = { onConfirm(LocalTime.of(state.hour, state.minute)) }) { Text(confirmLabel) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.form_btn_cancel)) } },
    )
}
