package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.size
import ch.nicolab.cadence.designsystem.theme.cadence
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.theme.Radius
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

/**
 * Aujourd'hui : charge de la journée, carte du matin, le retard replié, les tâches et événements du jour mêlés par
 * heure, carte du soir, puis Demain, Suggérées et les terminées, repliés. « Planifier ma semaine » vit dans Planifier.
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
    // « À caser » (sans heure, ou heure passée sans être faite) puis « Ma journée » sur une ligne du temps.
    val timeline = remember(state.today, state.planStarts, state.plan, proposedUids, events, moment.now, zone) {
        TodayTimeline.of(
            state.today.filterNot { it.uid in proposedUids }, events, state.planStarts, state.plan.map { it.uid }, moment.now, zone,
        )
    }
    val toPlaceTasks = remember(timeline) { timeline.toPlace.map { it.task } }
    val dayItems = remember(timeline) { timeline.entries.filterIsInstance<TimelineEntry.Item>() }
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
    val shownUids = remember(late, state.today) {
        late.mapTo(HashSet()) { it.uid } + state.today.map { it.uid }
    }
    val planBoard by viewModel.planBoard.collectAsStateWithLifecycle()
    val later = remember(suggestions, tomorrowTasks, planBoard.horizons, today, shownUids) {
        PlanBoard.todayLater(tomorrowTasks, planBoard.horizons, today, suggestions, shownUids)
    }
    var openFolds by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var replanOpen by rememberSaveable { mutableStateOf(false) }

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

    LazyColumn(modifier = modifier, contentPadding = tasksListPadding()) {
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
                // Un bandeau posé à part, pas un titre de section : la liste du jour qui suit ne se lit pas comme les échues.
                OverdueBanner(
                    count = late.size,
                    open = open,
                    onReplan = { replanOpen = true },
                    onToggle = { openFolds = if (open) openFolds - OVERDUE_FOLD else openFolds + OVERDUE_FOLD },
                )
            }
            if (open) {
                taskRows(
                    late, projectNames, projectColors, moment, viewModel, onOpen,
                    projectIcons = projectIcons,
                    calm = true,
                    subtitleOf = { task ->
                        state.plannedDays[task.uid]?.let {
                            stringResource(R.string.tasks_overdue_planned_on, dayLabel(it, today, DayLabelStyle.SHORT))
                        }
                    },
                )
            }
        }
        if (late.isEmpty() && timeline.toPlace.isEmpty() && dayItems.isEmpty() && proposals == null) {
            item(key = "closed") { ClosedDay(state.completed.size) }
        }
        if (timeline.toPlace.isNotEmpty()) {
            item(key = "to-place-title") {
                val minutes = toPlaceTasks.sumOf { it.estimatedMinutes?.takeIf { m -> m > 0 } ?: TodayTimeline.DEFAULT_TASK_MINUTES }
                TimelineSectionTitle(stringResource(R.string.today_section_to_place), "~" + durationText(minutes))
            }
            items(timeline.toPlace, key = { "task:${it.task.uid}" }) { entry ->
                val task = entry.task
                TaskRow(
                    modifier = Modifier.animateItem(),
                    calm = true,
                    calmMark = entry.missedAt?.let { stringResource(R.string.today_missed_at, minuteFormat.format(it.atZone(zone))) },
                    task = task,
                    projectName = task.projectUid?.let { projectNames[it] },
                    projectIcon = task.projectUid?.let { projectIcons[it] },
                    projectColor = task.projectUid?.let { projectColors[it] },
                    today = today,
                    zone = zone,
                    onToggle = { viewModel.toggle(task, hold = true) },
                    onOpen = { onOpen(task) },
                    onSwipeAction = { viewModel.swipe(task, it) },
                    onMenu = { viewModel.openMenu(task, toPlaceTasks) },
                )
            }
        }
        if (dayItems.isNotEmpty()) {
            item(key = "day-title") { TimelineSectionTitle(stringResource(R.string.today_section_day)) }
            items(timeline.entries, key = { entry ->
                when (entry) {
                    is TimelineEntry.Item -> entry.item.key
                    TimelineEntry.Now -> "now"
                    is TimelineEntry.Free -> "free"
                }
            }) { entry ->
                when (entry) {
                    TimelineEntry.Now -> TimelineNowRow(moment.now, zone)
                    is TimelineEntry.Free -> TimelineFreeRow(entry, toPlaceTasks.size) {
                        val edits = TodayTimeline.fill(toPlaceTasks, entry).map { PlanningChanges.place(today, it) }
                        commit(edits, context.resources.getQuantityString(R.plurals.planning_placed_message, edits.size, edits.size))
                    }
                    is TimelineEntry.Item -> when (val item = entry.item) {
                        is TodayItem.Task -> TimelineTaskRow(
                            task = item.task,
                            entry = entry,
                            now = moment.now,
                            zone = zone,
                            onToggle = { viewModel.toggle(item.task, hold = true) },
                            onOpen = { onOpen(item.task) },
                            onMenu = { viewModel.openMenu(item.task) },
                            onSwipeAction = { viewModel.swipe(item.task, it) },
                            modifier = Modifier.animateItem(),
                        )
                        is TodayItem.Event -> TimelineEventRow(
                            event = item.event,
                            entry = entry,
                            now = moment.now,
                            zone = zone,
                            checkable = calendarSettings.checkEvents,
                            onToggle = { viewModel.toggleEvent(item.event.event.key) },
                            onOpen = { viewModel.openEventDetail(item.event.event.key) },
                            onMenu = { viewModel.openEventMenu(item.event.event.key) },
                            onSwipeAction = { viewModel.swipeEvent(item.event, it) },
                            modifier = Modifier.animateItem(),
                        )
                    }
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
        item(key = "routine") { routineStrip() }
        // Aujourd'hui sert à faire : seuls demain et les suggestions attendent repliés ; la semaine et au-delà vivent dans
        // Planifier, pour ne pas peser sur la journée.
        listOf(
            Triple("tomorrow", R.string.planning_closed_tomorrow, later.tomorrow),
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
                        style = MaterialTheme.typography.labelLarge,
                        color = cadence.onSurfaceVariant,
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
    if (replanOpen) {
        // Le matin d'abord : les échues se replacent d'un toucher chacune, sans passer par Planifier.
        OverdueReplanSheet(
            tasks = late,
            today = today,
            dayCounts = planBoard.days.associate { it.date to it.open.size },
            onChoose = { task, choice -> viewModel.replanOverdue(task, choice) },
            onChooseMany = { viewModel.replanOverdue(it) },
            onSpread = { viewModel.overdueSpread(it) },
            onOpen = {
                replanOpen = false
                onOpen(it)
            },
            onDismiss = { replanOpen = false },
        )
    }
}

/** Titre d'une section repliée : son nom, son compte, et la flèche qui dit si elle est ouverte. */
@Composable
private fun FoldHeader(
    title: String,
    count: Int,
    open: Boolean,
    action: (@Composable () -> Unit)? = null,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clickable(role = Role.Button, onClick = onToggle)
            .padding(vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Même voix que la routine et la bande des événements : petit, discret, à la même marge.
        Text(
            text = "$title $count",
            style = MaterialTheme.typography.labelLarge,
            color = cadence.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        action?.invoke()
        Icon(
            if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
            contentDescription = null,
            tint = cadence.onSurfaceVariant,
        )
    }
}

private const val OVERDUE_FOLD = "overdue"

private val minuteFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

private fun minuteText(minute: Int): String = LocalTime.of(minute / 60, minute % 60).format(minuteFormat)

/** Bandeau des échues : « 3 tâches échues », « Replanifier », et la flèche qui déroule la liste ; neutre, jamais alarmant. */
@Composable
private fun OverdueBanner(count: Int, open: Boolean, onReplan: () -> Unit, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Space.xs)
            .clip(Radius.Control)
            .background(cadence.containerLow)
            .clickable(role = Role.Button, onClick = onToggle)
            .padding(start = Space.lg, end = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = pluralStringResource(R.plurals.today_overdue_banner, count, count),
            style = MaterialTheme.typography.labelLarge,
            color = cadence.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onReplan) { Text(stringResource(R.string.overdue_replan_button)) }
        Icon(
            if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
            contentDescription = null,
            tint = cadence.onSurfaceVariant,
            modifier = Modifier.padding(end = Space.sm),
        )
    }
}
