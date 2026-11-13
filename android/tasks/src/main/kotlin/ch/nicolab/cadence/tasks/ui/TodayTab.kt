package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.outlined.DragIndicator
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.zIndex
import ch.nicolab.cadence.designsystem.theme.cadence
import kotlin.math.abs
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.planning.PlanBoard
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.planning.DayPlans
import ch.nicolab.cadence.tasks.planning.DayRhythm
import ch.nicolab.cadence.tasks.planning.PlanEdit
import ch.nicolab.cadence.tasks.planning.PlanningChanges
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch
import ch.nicolab.cadence.tasks.proposals.ProposalKind
import ch.nicolab.cadence.tasks.ui.proposals.ProposalButton

/**
 * Aujourd'hui : entrée vers Ma journée, charge de la journée, carte du soir (terminer), puis le retard,
 * les tâches et événements du jour mêlés par heure, et les tâches terminées (repliées par défaut).
 */
@Composable
internal fun TodayTab(
    viewModel: TasksViewModel,
    snackbar: SnackbarHostState,
    onOpen: (TaskItem) -> Unit,
    modifier: Modifier = Modifier,
    routineStrip: @Composable () -> Unit = {},
    /** La carte du matin ouvre Planifier, où se trient les échues et se placent les tâches. */
    onOpenPlan: () -> Unit = {},
    /** « Masquer les terminées » : la section Terminées disparaît (réglage d'Aujourd'hui, gardé sur l'appareil). */
    hideDone: Boolean = false,
) {
    val planning: PlanningViewModel = viewModel()
    val state by viewModel.today.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val events by viewModel.todayEvents.collectAsStateWithLifecycle()
    val upcoming by viewModel.upcoming.collectAsStateWithLifecycle()
    val suggestions by viewModel.suggestions.collectAsStateWithLifecycle()
    val weekStart by viewModel.weekStart.collectAsStateWithLifecycle()
    val calendarSettings by viewModel.calendarSettings.collectAsStateWithLifecycle()
    val settings by planning.settings.collectAsStateWithLifecycle()
    val dismissedDay by planning.dismissedDay.collectAsStateWithLifecycle()
    val closedDay by planning.closedDay.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val projectColors = rememberProjectColors(viewModel)
    val projectIcons = rememberProjectIcons(viewModel)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val genericError = stringResource(R.string.tasks_error_generic)
    val undoLabel = stringResource(R.string.tasks_undo)
    var completedExpanded by rememberSaveable { mutableStateOf(false) }
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
            planned = state.plan,
        )
    }
    val proposedUids = proposals?.uids.orEmpty()
    val agenda = remember(state.today, state.planStarts, proposedUids, events, zone) {
        mergeTodayItems(state.today.filterNot { it.uid in proposedUids }, events, zone, state.planStarts, state.plan.map { it.uid })
    }
    val agendaTasks = remember(agenda) { agenda.filterIsInstance<TodayItem.Task>().map { it.task } }
    val reorderable = remember(agendaTasks, state.planStarts) { viewModel.todayUntimed(agendaTasks) }
    val listState = rememberLazyListState()
    var dragUid by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableFloatStateOf(0f) }

    /** Fin d'un glisser de poignée : la tâche prend le rang de la ligne rangeable la plus proche de son centre. */
    fun finishDrag() {
        val uid = dragUid
        val offset = dragOffset
        dragUid = null
        dragOffset = 0f
        if (uid == null) return
        val visible = listState.layoutInfo.visibleItemsInfo
        val dragged = visible.firstOrNull { it.key == "task:$uid" } ?: return
        val center = dragged.offset + dragged.size / 2f + offset
        val target = visible
            .filter { (it.key as? String)?.removePrefix("task:") in reorderable }
            .minByOrNull { abs(it.offset + it.size / 2f - center) } ?: return
        val toIndex = reorderable.indexOf((target.key as String).removePrefix("task:"))
        agendaTasks.firstOrNull { it.uid == uid }?.let { viewModel.reorderToday(it, reorderable, toIndex) }
    }
    val plannedToday = remember(state.plan) { state.plan.mapTo(HashSet()) { it.uid } }
    val triageable = remember(state.overdue) { PlanningChanges.movable(state.overdue) }
    val unfinished = remember(state.today) { PlanningChanges.movable(state.today) }
    val localNow = remember(moment.now, zone) { LocalTime.ofSecondOfDay(moment.now.atZone(zone).toLocalTime().toSecondOfDay().toLong()) }
    val closed = closedDay == today
    val morningVisible = proposals == null && DayRhythm.morningCardVisible(
        settings, today, localNow, dismissedDay, triageable.size, plan.toPlace.size, suggestions.size,
    )
    val eveningVisible = DayRhythm.eveningCardVisible(
        settings, today, localNow, closedDay, state.completed.size, unfinished.size,
    )
    val tomorrowTasks = upcoming[today.plusDays(1)].orEmpty()
    // Toutes les échues, planifiées un autre jour comprises (avec ce jour) : rien de passé ne disparaît d'Aujourd'hui.
    val late = remember(state.overdue, state.overduePlanned) {
        (state.overdue + state.overduePlanned).sortedBy { it.dueDay }
    }
    val shownUids = remember(late, agenda) {
        late.mapTo(HashSet()) { it.uid } + agenda.filterIsInstance<TodayItem.Task>().map { it.task.uid }
    }
    val planBoard by viewModel.planBoard.collectAsStateWithLifecycle()
    val later = remember(suggestions, tomorrowTasks, planBoard.horizons, today, shownUids) {
        PlanBoard.todayLater(tomorrowTasks, planBoard.horizons, today, suggestions, shownUids)
    }
    var openFolds by rememberSaveable { mutableStateOf(emptyList<String>()) }

    /** Le plan d'aujourd'hui tient déjà [task] : Reporter la déplace, sinon l'ajoute au jour visé. L'échéance ne bouge pas. */
    fun report(task: TaskItem, day: LocalDate): PlanEdit =
        PlanningChanges.reportPlan(task, today, day, plannedToday = task.uid in plannedToday)

    /** Applique [edits] au plan puis propose « Annuler » : tout se défait d'un geste, y compris `afterUndo`. */
    fun commit(edits: List<PlanEdit>, message: String, afterUndo: () -> Unit = {}) {
        if (edits.isEmpty()) return
        scope.launch {
            planning.applyPlan(edits)
                .onFailure { snackbar.showSnackbar(it.message ?: genericError) }
                .onSuccess { undo ->
                    snackbar.currentSnackbarData?.dismiss()
                    val result = snackbar.showSnackbar(message, undoLabel, duration = SnackbarDuration.Long)
                    if (result == SnackbarResult.ActionPerformed) {
                        planning.undoPlan(undo).onFailure { snackbar.showSnackbar(it.message ?: genericError) }
                        afterUndo()
                    }
                }
        }
    }

    fun acceptProposals() {
        val current = proposals ?: return
        val byUid = state.today.associateBy { it.uid }
        val edits = current.blocks.filter { block -> block.uid in byUid }.map { PlanningChanges.place(today, it) }
        proposals = null
        commit(edits, context.resources.getQuantityString(R.plurals.planning_placed_message, edits.size, edits.size))
    }

    val placementRequested by planning.placementRequested.collectAsStateWithLifecycle()
    LaunchedEffect(placementRequested) {
        if (placementRequested) {
            val placement = plan.propose()
            proposals = Proposals(
                blocks = placement.blocks,
                unplaced = plan.toPlace.filter { it.uid in placement.unplaced },
            )
            planning.placementHandled()
        }
    }

    fun carryToTomorrow() {
        val edits = unfinished.map { report(it, today.plusDays(1)) }
        planning.closeDay(today)
        if (edits.isEmpty()) return
        commit(
            edits,
            context.resources.getQuantityString(R.plurals.planning_moved_tomorrow, edits.size, edits.size),
            afterUndo = planning::reopenDay,
        )
    }

    LazyColumn(modifier = modifier, state = listState, contentPadding = tasksListPadding()) {
        item(key = "proposal-week") { ProposalButton(ProposalKind.WEEK, Modifier.padding(bottom = Space.sm)) }
        if (DayRhythm.capacityVisible(plan.workday, closed, plan.capacity)) {
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
                        commit(late.map { report(it, today.plusDays(1)) }, context.resources.getQuantityString(R.plurals.planning_moved_tomorrow, late.size, late.size))
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
                        toPlaceCount = plan.toPlace.size,
                        suggestionCount = suggestions.size,
                        onOpen = onOpenPlan,
                        onDismiss = { planning.dismissMorning(today) },
                    )
                }
            }
        }
        if (late.isNotEmpty()) {
            // Replié comme les sections du bas (et le web) : le retard se voit d'un coup d'œil sans prendre la page.
            val open = OVERDUE_FOLD in openFolds
            item(key = "fold-$OVERDUE_FOLD") {
                FoldHeader(stringResource(R.string.tasks_section_overdue), late.size, open) {
                    openFolds = if (open) openFolds - OVERDUE_FOLD else openFolds + OVERDUE_FOLD
                }
            }
            if (open) {
                taskRows(
                    late, projectNames, projectColors, moment, viewModel, onOpen,
                    projectIcons = projectIcons,
                    subtitleOf = { task ->
                        state.plannedDays[task.uid]?.let {
                            stringResource(R.string.tasks_overdue_planned_on, dayLabel(it, today, DayLabelStyle.SHORT))
                        }
                    },
                )
            }
        }
        if (late.isEmpty() && agenda.isEmpty() && proposals == null) {
            item(key = "closed") { ClosedDay(state.completed.size) }
        }
        if (agenda.isNotEmpty()) {
            agendaRows(
                agenda, projectNames, projectColors, moment, viewModel, onOpen, calendarSettings.checkEvents,
                projectIcons = projectIcons,
                planStarts = state.planStarts,
                drag = TodayDrag(
                    reorderable = reorderable.toSet(),
                    uid = dragUid,
                    offset = { dragOffset },
                    onStart = {
                        dragUid = it
                        dragOffset = 0f
                    },
                    onMove = { dragOffset += it },
                    onEnd = ::finishDrag,
                ),
            )
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
        item(key = "routine") { routineStrip() }
        // Aujourd'hui sert à faire : ce qui pourrait suivre attend replié, à dérouler une fois le jour fini.
        listOf(
            Triple("tomorrow", R.string.planning_closed_tomorrow, later.tomorrow),
            Triple("week", R.string.plan_horizon_week, later.week),
            Triple("next-week", R.string.plan_horizon_next_week, later.nextWeek),
            Triple("month", R.string.plan_horizon_this_month, later.thisMonth),
            Triple("next-month", R.string.plan_horizon_next_month, later.nextMonth),
            Triple("someday", R.string.plan_horizon_someday, later.someday),
            Triple("suggested", R.string.today_fold_suggested, later.suggested),
        ).filter { (_, _, tasks) -> tasks.isNotEmpty() }.forEach { (key, label, tasks) ->
            val open = key in openFolds
            item(key = "fold-$key") {
                FoldHeader(stringResource(label), tasks.size, open) {
                    openFolds = if (open) openFolds - key else openFolds + key
                }
            }
            if (open) {
                taskRows(tasks, projectNames, projectColors, moment, viewModel, onOpen, projectIcons = projectIcons)
            }
        }
        if (!hideDone && state.completed.isNotEmpty()) {
            item(key = "completed-header") {
                val toggleLabel = stringResource(if (completedExpanded) R.string.tasks_completed_hide else R.string.tasks_completed_show)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = Size.touch)
                        .clickable(role = Role.Button, onClickLabel = toggleLabel) { completedExpanded = !completedExpanded }
                        .padding(vertical = Space.md),
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
                taskRows(state.completed, projectNames, projectColors, moment, viewModel, onOpen, projectIcons = projectIcons)
            }
        }
    }
}

/** Titre d'une section repliée : son nom, son compte, et la flèche qui dit si elle est ouverte. */
@Composable
private fun FoldHeader(title: String, count: Int, open: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(role = Role.Button, onClick = onToggle)
            .padding(vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = "$title $count", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
        Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, contentDescription = null)
    }
}

private const val OVERDUE_FOLD = "overdue"

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
    projectIcons: Map<String, String> = emptyMap(),
    planStarts: Map<String, Instant> = emptyMap(),
    drag: TodayDrag? = null,
) {
    items(agenda, key = { it.key }) { item ->
        when (item) {
            is TodayItem.Task -> TaskRow(
                modifier = if (drag != null && drag.uid == item.task.uid) {
                    Modifier.zIndex(1f).graphicsLayer { translationY = drag.offset() }
                } else {
                    Modifier.animateItem()
                },
                trailing = drag?.takeIf { item.task.uid in it.reorderable }?.let { { DragHandle(item.task.uid, it) } },
                task = item.task,
                projectName = item.task.projectUid?.let { projectNames[it] },
                projectIcon = item.task.projectUid?.let { projectIcons[it] },
                projectColor = item.task.projectUid?.let { projectColors[it] },
                today = moment.today,
                zone = moment.zone,
                onToggle = { viewModel.toggle(item.task, hold = true) },
                onOpen = { onOpen(item.task) },
                onSwipeAction = { viewModel.swipe(item.task, it) },
                onMenu = { viewModel.openMenu(item.task, agenda.filterIsInstance<TodayItem.Task>().map { it.task }) },
                sectionDay = moment.today,
                plannedAt = planStarts[item.task.uid],
            )
            is TodayItem.Event -> EventRow(
                item = item.event,
                zone = moment.zone,
                checkable = checkEvents,
                onToggle = { viewModel.toggleEvent(item.event.event.key) },
                onOpen = { viewModel.openEventDetail(item.event.event.key) },
                onMenu = { viewModel.openEventMenu(item.event.event.key) },
                onSwipeAction = { viewModel.swipeEvent(item.event, it) },
                modifier = Modifier.animateItem(),
            )
        }
    }
}

/** Glisser d'Aujourd'hui : les tâches rangeables (sans heure), la ligne tenue et son décalage, les rappels du geste. */
private class TodayDrag(
    val reorderable: Set<String>,
    val uid: String?,
    val offset: () -> Float,
    val onStart: (String) -> Unit,
    val onMove: (Float) -> Unit,
    val onEnd: () -> Unit,
)

/**
 * Poignée de rangement : un glisser vertical sur elle seule range la ligne. Elle ne réagit qu'à la verticale, donc ne
 * gêne ni les balayages horizontaux de la ligne ni l'appui long du menu ; Monter et Descendre restent dans le menu.
 */
@Composable
private fun DragHandle(uid: String, drag: TodayDrag) {
    Icon(
        Icons.Outlined.DragIndicator,
        contentDescription = stringResource(R.string.today_drag_handle),
        tint = cadence.onSurfaceVariant,
        modifier = Modifier
            .size(Size.touch)
            .pointerInput(uid) {
                detectVerticalDragGestures(
                    onDragStart = { drag.onStart(uid) },
                    onVerticalDrag = { change, amount ->
                        change.consume()
                        drag.onMove(amount)
                    },
                    onDragEnd = drag.onEnd,
                    onDragCancel = drag.onEnd,
                )
            }
            .padding(Space.md),
    )
}
