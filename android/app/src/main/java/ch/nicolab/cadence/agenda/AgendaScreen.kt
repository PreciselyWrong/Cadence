package ch.nicolab.cadence.agenda

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.WeekFields
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

private const val MINUTE_MS = 60_000L
private val DAY_LABEL: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)
private val MONTH_LABEL: DateTimeFormatter = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.FRENCH)
private val SHORT_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH)

/**
 * Onglet Agenda : sélecteur de vue, bandeau des jours, grille horaire, mois ou liste.
 * La permission des agendas de l'appareil est proposée ici ; sans elle, les tâches restent visibles.
 */
@Composable
fun AgendaScreen(modifier: Modifier = Modifier) {
    val viewModel: AgendaViewModel = viewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val calendars by viewModel.calendars.collectAsStateWithLifecycle()
    var displayOpen by rememberSaveable { mutableStateOf(false) }
    val now by produceState(LocalTime.now()) {
        while (true) {
            delay(MINUTE_MS)
            value = LocalTime.now()
        }
    }

    Column(modifier.fillMaxSize().statusBarsPadding().padding(horizontal = Space.gutter)) {
        ScreenHeader(
            title = stringResource(R.string.agenda_title),
            subtitle = agendaSubtitle(state),
            actions = {
                RoundHeaderButton(
                    icon = Icons.Outlined.Today,
                    contentDescription = stringResource(R.string.agenda_today),
                    onClick = viewModel::goToToday,
                )
                Spacer(Modifier.width(Space.sm))
                RoundHeaderButton(
                    icon = Icons.Outlined.Tune,
                    contentDescription = stringResource(R.string.agenda_display),
                    onClick = { displayOpen = true },
                )
            },
        )
        SegmentedTabs(
            labels = AgendaMode.entries.map { stringResource(it.labelRes()) },
            selected = state.mode.ordinal,
            onSelect = { viewModel.selectMode(AgendaMode.entries[it]) },
            modifier = Modifier.padding(top = Space.sm),
        )
        if (state.permissionMissing) {
            CalendarPermissionPanel(onGranted = viewModel::refreshCalendar)
        }
        when (state.mode) {
            AgendaMode.DAY, AgendaMode.THREE_DAYS -> TimeAgenda(
                state = state,
                now = now,
                onSelect = viewModel::select,
                onSwipe = viewModel::swipe,
                onSwipeWeek = viewModel::swipeWeek,
                onToggleEvent = viewModel::toggleEvent,
            )
            AgendaMode.MONTH -> MonthAgenda(
                state = state,
                onSelect = viewModel::select,
                onSwipe = viewModel::swipe,
                onToggleEvent = viewModel::toggleEvent,
            )
            AgendaMode.LIST -> ListAgenda(state = state, onToggleEvent = viewModel::toggleEvent)
        }
    }

    if (displayOpen) {
        AgendaOptionsSheet(
            options = state.options,
            calendars = calendars,
            onOptionsChange = viewModel::updateOptions,
            onCalendarShown = viewModel::setCalendarShown,
            onDismiss = { displayOpen = false },
        )
    }
}

private fun AgendaMode.labelRes(): Int = when (this) {
    AgendaMode.DAY -> R.string.agenda_mode_day
    AgendaMode.THREE_DAYS -> R.string.agenda_mode_three_days
    AgendaMode.MONTH -> R.string.agenda_mode_month
    AgendaMode.LIST -> R.string.agenda_mode_list
}

@Composable
private fun agendaSubtitle(state: AgendaUiState): String {
    val selected = state.selected
    val base = when (state.mode) {
        AgendaMode.DAY -> dayLabel(selected)
        AgendaMode.THREE_DAYS -> stringResource(
            R.string.agenda_range,
            selected.format(SHORT_DAY),
            selected.plusDays(2).format(SHORT_DAY),
        )
        AgendaMode.MONTH -> selected.format(MONTH_LABEL).replaceFirstChar { it.titlecase(Locale.FRENCH) }
        AgendaMode.LIST -> stringResource(R.string.agenda_list_subtitle, AGENDA_LIST_DAYS)
    }
    if (!state.options.weekNumbers || state.mode == AgendaMode.LIST) return base
    val week = selected.get(WeekFields.ISO.weekOfWeekBasedYear())
    return stringResource(R.string.agenda_week_subtitle, base, week)
}

@Composable
private fun CalendarPermissionPanel(onGranted: () -> Unit) {
    val palette = cadence
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) onGranted()
    }
    Panel(modifier = Modifier.fillMaxWidth().padding(top = Space.md)) {
        Column(Modifier.padding(Space.lg), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            Text(
                text = stringResource(R.string.agenda_permission_title),
                style = MaterialTheme.typography.titleMedium,
                color = palette.onSurface,
            )
            Text(
                text = stringResource(R.string.agenda_permission_body),
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
            )
            PrimaryAction(
                label = stringResource(R.string.agenda_permission_allow),
                onClick = { launcher.launch(Manifest.permission.READ_CALENDAR) },
            )
        }
    }
}

internal fun dayLabel(date: LocalDate): String =
    date.format(DAY_LABEL).replaceFirstChar { it.titlecase(Locale.FRENCH) }
