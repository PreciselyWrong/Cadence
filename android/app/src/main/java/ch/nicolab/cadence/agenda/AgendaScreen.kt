package ch.nicolab.cadence.agenda

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.glass
import ch.nicolab.cadence.designsystem.theme.glassBorder
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.WeekFields
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val MINUTE_MS = 60_000L
private val DAY_LABEL: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)
private val MONTH_LABEL: DateTimeFormatter = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.FRENCH)
private val SHORT_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH)
private val SNACKBAR_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val CAPSULE_CELL_WIDTH = 44.dp

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
    val drag = remember { TrayDragState() }
    var boxOrigin by remember { mutableStateOf(Offset.Zero) }
    val snackbar = remember { SnackbarHostState() }
    val resources = LocalContext.current.resources
    val requestCalendar = rememberCalendarPermissionRequest(onGranted = viewModel::refreshCalendar)
    val now by produceState(LocalTime.now()) {
        while (true) {
            delay(MINUTE_MS)
            value = LocalTime.now()
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.scheduled.collect { receipt ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(
                    message = resources.getString(R.string.agenda_scheduled_at, receipt.at.format(SNACKBAR_TIME)),
                    actionLabel = resources.getString(R.string.agenda_undo),
                    duration = SnackbarDuration.Short,
                )
                if (result == SnackbarResult.ActionPerformed) viewModel.undoSchedule(receipt)
            }
        }
    }
    LaunchedEffect(viewModel) {
        viewModel.completed.collect { uid ->
            snackbar.currentSnackbarData?.dismiss()
            launch {
                val result = snackbar.showSnackbar(
                    message = resources.getString(R.string.agenda_task_completed),
                    actionLabel = resources.getString(R.string.agenda_undo),
                    duration = SnackbarDuration.Short,
                )
                if (result == SnackbarResult.ActionPerformed) viewModel.undoComplete(uid)
            }
        }
    }

    Box(modifier.fillMaxSize().onGloballyPositioned { boxOrigin = it.positionInRoot() }) {
        Column(Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = Space.gutter)) {
            AgendaHeader(
                subtitle = agendaSubtitle(state),
                onPrevious = { viewModel.swipe(-1) },
                onNext = { viewModel.swipe(1) },
                onToday = viewModel::goToToday,
                onDisplay = { displayOpen = true },
            )
            SegmentedTabs(
                labels = AgendaMode.entries.map { stringResource(it.labelRes()) },
                selected = state.mode.ordinal,
                onSelect = { viewModel.selectMode(AgendaMode.entries[it]) },
                modifier = Modifier.padding(top = Space.xs),
            )
            if (state.permissionMissing) CalendarPermissionBanner(onAllow = requestCalendar)
            when (state.mode) {
                AgendaMode.DAY, AgendaMode.THREE_DAYS -> TimeAgenda(
                    state = state,
                    now = now,
                    onSelect = viewModel::select,
                    onSwipe = viewModel::swipe,
                    onSwipeWeek = viewModel::swipeWeek,
                    onToggleEvent = viewModel::toggleEvent,
                    drag = drag,
                    onDrop = { uid, at -> viewModel.schedule(uid, at) },
                    onResize = { uid, minutes -> viewModel.resizeTask(uid, minutes) },
                )
                AgendaMode.MONTH -> MonthAgenda(
                    state = state,
                    onSelect = viewModel::select,
                    onSwipe = viewModel::swipe,
                    onToggleEvent = viewModel::toggleEvent,
                    onToggleTask = viewModel::toggleTask,
                )
                AgendaMode.LIST -> ListAgenda(
                    state = state,
                    onToggleEvent = viewModel::toggleEvent,
                    onToggleTask = viewModel::toggleTask,
                )
            }
        }
        DragGhost(drag = drag, origin = boxOrigin)
        SnackbarHost(
            snackbar,
            Modifier
                .align(Alignment.BottomCenter)
                .padding(start = Space.gutter, end = Space.gutter, bottom = navigationClearance() + Space.lg),
        )
    }

    if (displayOpen) {
        AgendaOptionsSheet(
            options = state.options,
            calendars = calendars,
            permissionMissing = state.permissionMissing,
            onRequestPermission = requestCalendar,
            onOptionsChange = viewModel::updateOptions,
            onCalendarShown = viewModel::setCalendarShown,
            onDismiss = { displayOpen = false },
        )
    }
}

/**
 * En-tête : le titre et, alignés sur lui, le groupe précédent · aujourd'hui · suivant puis l'affichage ;
 * le contexte (jour, plage, mois) passe dessous sur toute la largeur.
 */
@Composable
private fun AgendaHeader(
    subtitle: String,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    onDisplay: () -> Unit,
) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(top = Space.md)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.agenda_title),
                style = MaterialTheme.typography.displaySmall,
                color = palette.onSurface,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Row(
                Modifier
                    .height(Size.headerButton)
                    .clip(Radius.Pill)
                    .background(palette.glass)
                    .border(Size.hairline, palette.glassBorder, Radius.Pill),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CapsuleButton(Icons.Outlined.ChevronLeft, stringResource(R.string.agenda_previous), onPrevious)
                CapsuleButton(Icons.Outlined.Today, stringResource(R.string.agenda_today), onToday)
                CapsuleButton(Icons.Outlined.ChevronRight, stringResource(R.string.agenda_next), onNext)
            }
            Spacer(Modifier.width(Space.sm))
            RoundHeaderButton(
                icon = Icons.Outlined.Tune,
                contentDescription = stringResource(R.string.agenda_display),
                onClick = onDisplay,
            )
        }
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

@Composable
private fun CapsuleButton(icon: ImageVector, description: String, onClick: () -> Unit) {
    val haptic = rememberCadenceHaptic()
    Box(
        Modifier
            .size(width = CAPSULE_CELL_WIDTH, height = Size.headerButton)
            .clip(CircleShape)
            .clickable(role = Role.Button) {
                haptic.tap()
                onClick()
            }
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = cadence.onSurface, modifier = Modifier.size(Size.iconLarge))
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
        AgendaMode.THREE_DAYS -> threeDays(selected, state.options.weekends).let { days ->
            stringResource(R.string.agenda_range, days.first().format(SHORT_DAY), days.last().format(SHORT_DAY))
        }
        AgendaMode.MONTH -> selected.format(MONTH_LABEL).replaceFirstChar { it.titlecase(Locale.FRENCH) }
        AgendaMode.LIST -> if (selected == state.today) {
            stringResource(R.string.agenda_list_subtitle, AGENDA_LIST_DAYS)
        } else {
            stringResource(R.string.agenda_range, selected.format(SHORT_DAY), selected.plusDays(AGENDA_LIST_DAYS - 1L).format(SHORT_DAY))
        }
    }
    if (!state.options.weekNumbers || state.mode == AgendaMode.LIST) return base
    val week = selected.get(WeekFields.ISO.weekOfWeekBasedYear())
    return stringResource(R.string.agenda_week_subtitle, base, week)
}

/** Bandeau d'une ligne : sans la permission, seules les tâches sont visibles ; le détail est dans Affichage. */
@Composable
private fun CalendarPermissionBanner(onAllow: () -> Unit) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = Space.sm)
            .clip(Radius.Chip)
            .background(palette.card)
            .padding(start = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.CalendarMonth, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
        Text(
            text = stringResource(R.string.agenda_permission_inline),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            modifier = Modifier.weight(1f).padding(horizontal = Space.sm),
        )
        Text(
            text = stringResource(R.string.agenda_permission_allow),
            style = MaterialTheme.typography.labelLarge,
            color = palette.primary,
            modifier = Modifier
                .minimumInteractiveComponentSize()
                .clickable(role = Role.Button, onClick = onAllow)
                .padding(horizontal = Space.md),
        )
    }
}

internal fun dayLabel(date: LocalDate): String =
    date.format(DAY_LABEL).replaceFirstChar { it.titlecase(Locale.FRENCH) }
