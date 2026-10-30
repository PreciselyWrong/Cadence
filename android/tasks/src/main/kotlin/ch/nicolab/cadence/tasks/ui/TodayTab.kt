package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SectionTone
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.DayPlans
import ch.nicolab.cadence.tasks.planning.DayRhythm
import ch.nicolab.cadence.tasks.planning.PlanningChanges
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch

/**
 * Aujourd'hui : charge de la journée, carte du matin (planifier) ou du soir (terminer), puis le retard,
 * les tâches et événements du jour mêlés par heure, et les tâches terminées (repliées par défaut).
 */
@Composable
internal fun TodayTab(
    viewModel: TasksViewModel,
    snackbar: SnackbarHostState,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
    routineStrip: @Composable () -> Unit = {},
) {
    val planning: PlanningViewModel = viewModel()
    val state by viewModel.today.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val events by viewModel.todayEvents.collectAsStateWithLifecycle()
    val upcoming by viewModel.upcoming.collectAsStateWithLifecycle()
    val calendarSettings by viewModel.calendarSettings.collectAsStateWithLifecycle()
    val calendarNoticeVisible by viewModel.calendarNoticeVisible.collectAsStateWithLifecycle()
    val settings by planning.settings.collectAsStateWithLifecycle()
    val dismissedDay by planning.dismissedDay.collectAsStateWithLifecycle()
    val closedDay by planning.closedDay.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val genericError = stringResource(R.string.tasks_error_generic)
    val undoLabel = stringResource(R.string.tasks_undo)
    var completedExpanded by rememberSaveable { mutableStateOf(false) }
    var planSheetOpen by rememberSaveable { mutableStateOf(false) }
    var proposals by remember { mutableStateOf<Proposals?>(null) }

    val today = moment.today
    val zone = moment.zone
    val plan = remember(today, moment.now, zone, settings, events, state.today) {
        DayPlans.of(
            day = today,
            zone = zone,
            settings = settings,
            events = events.map { it.event },
            dayTasks = state.today,
            notBefore = DayPlans.notBefore(today, moment.now, zone),
        )
    }
    val proposedUids = proposals?.uids.orEmpty()
    val agenda = remember(state.today, proposedUids, events, zone) {
        mergeTodayItems(state.today.filterNot { it.uid in proposedUids }, events, zone)
    }
    val triageable = remember(state.overdue) { PlanningChanges.movable(state.overdue) }
    val unfinished = remember(state.today) { PlanningChanges.movable(state.today) }
    val localNow = remember(moment.now, zone) { LocalTime.ofSecondOfDay(moment.now.atZone(zone).toLocalTime().toSecondOfDay().toLong()) }
    val closed = closedDay == today
    val morningVisible = proposals == null && DayRhythm.morningCardVisible(
        settings, today, localNow, dismissedDay, triageable.size, plan.toPlace.size,
    )
    val eveningVisible = DayRhythm.eveningCardVisible(
        settings, today, localNow, closedDay, state.completed.size, unfinished.size,
    )
    val tomorrowTasks = upcoming[today.plusDays(1)].orEmpty()

    /** Applique [changes] puis propose « Annuler » : tout se défait d'un geste, y compris `afterUndo`. */
    fun commit(changes: List<Pair<TaskItem, TaskChange>>, message: String, afterUndo: () -> Unit = {}) {
        if (changes.isEmpty()) return
        scope.launch {
            planning.apply(changes)
                .onFailure { snackbar.showSnackbar(it.message ?: genericError) }
                .onSuccess { originals ->
                    snackbar.currentSnackbarData?.dismiss()
                    val result = snackbar.showSnackbar(message, undoLabel, duration = SnackbarDuration.Long)
                    if (result == SnackbarResult.ActionPerformed) {
                        planning.restore(originals, zone).onFailure { snackbar.showSnackbar(it.message ?: genericError) }
                        afterUndo()
                    }
                }
        }
    }

    fun triage(tasks: List<TaskItem>, target: TriageTarget) {
        proposals = null
        val changes = tasks.map { task ->
            task to when (target) {
                TriageTarget.TODAY -> PlanningChanges.moveToDay(task, today, zone)
                TriageTarget.TOMORROW -> PlanningChanges.moveToDay(task, today.plusDays(1), zone)
                TriageTarget.LATER -> PlanningChanges.later()
            }
        }
        val plural = when (target) {
            TriageTarget.TODAY -> R.plurals.planning_moved_today
            TriageTarget.TOMORROW -> R.plurals.planning_moved_tomorrow
            TriageTarget.LATER -> R.plurals.planning_moved_later
        }
        commit(changes, context.resources.getQuantityString(plural, tasks.size, tasks.size))
    }

    fun acceptProposals() {
        val current = proposals ?: return
        val byUid = state.today.associateBy { it.uid }
        val changes = current.blocks.mapNotNull { block -> byUid[block.uid]?.let { it to PlanningChanges.place(today, block) } }
        proposals = null
        commit(changes, context.resources.getQuantityString(R.plurals.planning_placed_message, changes.size, changes.size))
    }

    fun carryToTomorrow() {
        val changes = unfinished.map { it to PlanningChanges.moveToDay(it, today.plusDays(1), zone) }
        planning.closeDay(today)
        if (changes.isEmpty()) return
        commit(
            changes,
            context.resources.getQuantityString(R.plurals.planning_moved_tomorrow, changes.size, changes.size),
            afterUndo = planning::reopenDay,
        )
    }

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
        if (calendarNoticeVisible) {
            item(key = "calendar-notice") {
                CardSlot {
                    CalendarPermissionNotice(
                        onGranted = viewModel::refreshCalendar,
                        onDismiss = viewModel::dismissCalendarNotice,
                    )
                }
            }
        }
        if (plan.workday && !closed) {
            item(key = "capacity") { CardSlot { CapacityLine(plan.capacity) } }
        }
        proposals?.let { current ->
            item(key = "proposal-bar") {
                CardSlot {
                ProposalPanel(
                    count = current.blocks.size,
                    unplacedCount = current.unplaced.size,
                    onAcceptAll = ::acceptProposals,
                    onCancel = { proposals = null },
                    onPostponeUnplaced = {
                        val late = current.unplaced
                        proposals = current.copy(unplaced = emptyList())
                        val changes = late.map { it to PlanningChanges.moveToDay(it, today.plusDays(1), zone) }
                        commit(changes, context.resources.getQuantityString(R.plurals.planning_moved_tomorrow, late.size, late.size))
                    },
                )
                }
            }
            val byUid = state.today.associateBy { it.uid }
            items(current.blocks, key = { "ghost:${it.uid}" }) { block ->
                byUid[block.uid]?.let { task ->
                    GhostRow(
                        name = task.name,
                        start = minuteText(block.start),
                        end = minuteText(block.end),
                        onRemove = { proposals = current.copy(blocks = current.blocks - block) },
                        modifier = Modifier.padding(bottom = Space.xs),
                    )
                }
            }
        }
        if (morningVisible) {
            item(key = "morning") {
                CardSlot {
                    MorningCard(
                        overdueCount = triageable.size,
                        toPlaceCount = plan.toPlace.size,
                        onOpen = { planSheetOpen = true },
                        onDismiss = { planning.dismissMorning(today) },
                    )
                }
            }
        }
        if (eveningVisible) {
            item(key = "evening") {
                CardSlot {
                    EveningCard(
                        doneCount = state.completed.size,
                        unfinishedCount = unfinished.size,
                        onCarry = ::carryToTomorrow,
                        onKeep = { planning.closeDay(today) },
                    )
                }
            }
        }
        if (state.overdue.isEmpty() && agenda.isEmpty() && proposals == null) {
            item(key = "closed") { ClosedDay(state.completed.size) }
            if (tomorrowTasks.isNotEmpty()) {
                item(key = "tomorrow-header") {
                    SectionHeader(title = stringResource(R.string.planning_closed_tomorrow), count = tomorrowTasks.size)
                }
                taskRows(tomorrowTasks, projectNames, projectColors, moment, viewModel, onOpen, sectionDay = today.plusDays(1))
            }
        }
        if (state.overdue.isNotEmpty()) {
            item(key = "overdue-header") {
                SectionHeader(
                    title = stringResource(R.string.tasks_section_overdue),
                    count = state.overdue.size,
                    tone = SectionTone.Error,
                )
            }
            taskRows(state.overdue, projectNames, projectColors, moment, viewModel, onOpen)
        }
        if (agenda.isNotEmpty()) {
            item(key = "today-header") { SectionHeader(title = stringResource(R.string.tasks_section_today), count = agenda.size) }
            agendaRows(agenda, projectNames, projectColors, moment, viewModel, onOpen, calendarSettings.checkEvents)
        }
        item(key = "routine") { routineStrip() }
        if (state.completed.isNotEmpty()) {
            item(key = "completed-header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { completedExpanded = !completedExpanded }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.tasks_section_completed, state.completed.size),
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        if (completedExpanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                        contentDescription = null,
                    )
                }
            }
            if (completedExpanded) {
                taskRows(state.completed, projectNames, projectColors, moment, viewModel, onOpen)
            }
        }
    }

    if (planSheetOpen) {
        PlanDaySheet(
            day = today,
            today = today,
            overdue = triageable,
            capacity = plan.capacity,
            toPlaceCount = plan.toPlace.size,
            workday = plan.workday,
            onTriage = ::triage,
            onPlace = {
                val placement = plan.propose()
                proposals = Proposals(
                    blocks = placement.blocks,
                    unplaced = plan.toPlace.filter { it.uid in placement.unplaced },
                )
                planSheetOpen = false
            },
            dismiss = { planSheetOpen = false },
        )
    }
}

private val minuteFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

private fun minuteText(minute: Int): String = LocalTime.of(minute / 60, minute % 60).format(minuteFormat)

/** Tâches et événements d'Aujourd'hui, dans l'ordre fourni par [mergeTodayItems]. */
private fun LazyListScope.agendaRows(
    agenda: List<TodayItem>,
    projectNames: Map<String, String>,
    projectColors: Map<String, Int>,
    moment: Moment,
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    checkEvents: Boolean,
) {
    items(agenda, key = { it.key }) { item ->
        when (item) {
            is TodayItem.Task -> TaskRow(
                modifier = Modifier.animateItem(),
                task = item.task,
                projectName = item.task.projectUid?.let { projectNames[it] },
                projectColor = item.task.projectUid?.let { projectColors[it] },
                today = moment.today,
                zone = moment.zone,
                onToggle = { viewModel.toggle(item.task, hold = true) },
                onOpen = { onOpen(item.task) },
                onSwipeAction = { viewModel.swipe(item.task, it) },
                onMenu = { viewModel.openMenu(item.task) },
                sectionDay = moment.today,
            )
            is TodayItem.Event -> EventRow(
                item = item.event,
                zone = moment.zone,
                checkable = checkEvents,
                onToggle = { viewModel.toggleEvent(item.event.event.key) },
            )
        }
    }
}
