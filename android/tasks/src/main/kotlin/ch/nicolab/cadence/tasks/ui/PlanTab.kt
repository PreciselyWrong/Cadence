@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.calendar.localEnd
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.glassScrim
import ch.nicolab.cadence.designsystem.components.glassWindow
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Elevation
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.glassBorder
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.planning.Horizon
import ch.nicolab.cadence.tasks.planning.PlanChoice
import ch.nicolab.cadence.tasks.planning.PlanChoices
import ch.nicolab.cadence.tasks.planning.PlanDay
import ch.nicolab.cadence.tasks.planning.PlanDayItem
import ch.nicolab.cadence.tasks.planning.PlanTrayRequest
import ch.nicolab.cadence.tasks.planning.PlanWeek
import ch.nicolab.cadence.tasks.planning.Tray
import ch.nicolab.cadence.tasks.planning.TrayFilter
import ch.nicolab.cadence.tasks.planning.WeekDay
import ch.nicolab.cadence.tasks.plugins.PluginActionButtons
import ch.nicolab.cadence.tasks.proposals.ProposalKind
import ch.nicolab.cadence.tasks.proposals.ProposalPhase
import ch.nicolab.cadence.tasks.review.ReviewStep
import ch.nicolab.cadence.tasks.ui.proposals.rememberProposalAction
import ch.nicolab.cadence.tasks.ui.triage.TriageEntry
import ch.nicolab.cadence.tasks.ui.triage.TriageScreen
import ch.nicolab.cadence.tasks.ui.triage.TriageViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Ce que la feuille de choix déplace : une tâche du tiroir, ou une idée de l'Inbox. */
private sealed interface ChoiceTarget {
    data class Task(val task: TaskItem) : ChoiceTarget
    data class Idea(val entry: InboxEntry) : ChoiceTarget
}

@StringRes
internal fun horizonLabel(horizon: Horizon): Int = when (horizon) {
    Horizon.WEEK -> R.string.plan_horizon_week
    Horizon.NEXT_WEEK -> R.string.plan_horizon_next_week
    Horizon.THIS_MONTH -> R.string.plan_horizon_this_month
    Horizon.NEXT_MONTH -> R.string.plan_horizon_next_month
    Horizon.SOMEDAY -> R.string.plan_horizon_someday
}

@StringRes
private fun filterLabel(filter: TrayFilter): Int = when (filter) {
    TrayFilter.TO_PLACE -> R.string.plan_filter_to_place
    TrayFilter.WEEK -> R.string.plan_horizon_week
    TrayFilter.MONTH -> R.string.plan_horizon_this_month
    TrayFilter.LATER -> R.string.plan_strip_title
}

/** Part de la hauteur de l'écran prise par le tiroir déplié. */
private const val TRAY_OPEN_FRACTION = 0.7f

/** Lignes du tiroir replié. */
private const val TRAY_PREVIEW = 2

/**
 * Planifier v2 (`planning/PlanWeek.kt`) : un lien IA discret pour le jour choisi, la bande de la semaine (charge,
 * nombre de tâches, points des événements ; glisser ou ‹ › change de semaine), la liste du jour choisi à la façon
 * d'Aujourd'hui, et en bas le tiroir « À placer » (filtres, « ⋯ » qui ouvre la feuille de choix). Tout passe par le
 * plan du jour, `week_of`, `month_of` ou `#someday` : jamais par l'échéance. [hideDone] masque les terminées du jour.
 */
@Composable
internal fun PlanTab(
    viewModel: TasksViewModel,
    onOpen: (TaskItem) -> Unit,
    hideDone: Boolean,
    modifier: Modifier = Modifier,
) {
    val board by viewModel.planBoard.collectAsStateWithLifecycle()
    val unsorted by viewModel.unsorted.collectAsStateWithLifecycle()
    val ideas by viewModel.inbox.collectAsStateWithLifecycle()
    val moment by viewModel.moment.collectAsStateWithLifecycle()
    val events by viewModel.weekEvents.collectAsStateWithLifecycle()
    val calendarSettings by viewModel.calendarSettings.collectAsStateWithLifecycle()
    val planning: PlanningViewModel = viewModel()
    val settings by planning.settings.collectAsStateWithLifecycle()
    val projectNames = rememberProjectNames(viewModel)
    val today = moment.today
    val zone = moment.zone

    val context = LocalContext.current
    var pushedCounts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    LaunchedEffect(Unit) {
        TasksGraph.review(context).tasks(ReviewStep.PUSHED).onSuccess { loaded ->
            pushedCounts = loaded.value.items
                .mapNotNull { item -> item.push?.recentCount?.takeIf { it >= 3 }?.let { item.uid to it } }
                .toMap()
        }
    }

    var page by rememberSaveable { mutableIntStateOf(0) }
    val start = PlanWeek.start(today, page)
    LaunchedEffect(start) { viewModel.showPlanWeek(start) }
    var selectedEpoch by rememberSaveable { mutableLongStateOf(today.toEpochDay()) }
    val selected = LocalDate.ofEpochDay(selectedEpoch)
        .takeIf { !it.isBefore(start) && it.isBefore(start.plusDays(PlanWeek.DAYS.toLong())) } ?: start
    val week = remember(start, board.days, events, zone, settings.hours) {
        PlanWeek.days(start, board.days, events, zone) { PlanWeek.capacity(settings.hours, it) }
    }
    val selectedDay = board.days.firstOrNull { it.date == selected } ?: PlanDay(selected, emptyList(), emptyList())
    val dayItems = remember(selectedDay, events, zone) { PlanWeek.dayItems(selectedDay, events, zone) }
    val tray = remember(unsorted, board.horizons, board.toSchedule) { PlanWeek.tray(unsorted, board.horizons, board.toSchedule) }

    var choosing by remember { mutableStateOf<ChoiceTarget?>(null) }
    var datePickFor by remember { mutableStateOf<ChoiceTarget?>(null) }
    var replanOpen by rememberSaveable { mutableStateOf(false) }
    var trayOpen by rememberSaveable { mutableStateOf(false) }
    var trayHeight by remember { mutableIntStateOf(0) }
    BackHandler(enabled = trayOpen) { trayOpen = false }
    // « Voir » après une capture sans date : le tiroir s'ouvre sur « À placer » (son filtre par défaut).
    val trayRequested by PlanTrayRequest.pending.collectAsStateWithLifecycle()
    LaunchedEffect(trayRequested) {
        if (trayRequested) {
            trayOpen = true
            PlanTrayRequest.consume()
        }
    }

    // « À trier (N) » en tête du tiroir : seulement en ligne, comme l'ancien écran Inbox.
    val triage: TriageViewModel = viewModel()
    val triageItems by triage.items.collectAsStateWithLifecycle()
    val triageOnline by triage.online.collectAsStateWithLifecycle()
    var triageOpen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(triage) { triage.refresh() }
    val triageCount = if (triageOnline) triageItems.size else 0

    fun showPage(next: Int) {
        val target = next.coerceIn(0, PlanWeek.LAST_PAGE)
        page = target
        selectedEpoch = PlanWeek.start(today, target).toEpochDay()
    }

    fun choose(target: ChoiceTarget, choice: PlanChoice) {
        choosing = null
        when (target) {
            is ChoiceTarget.Task -> when (choice) {
                is PlanChoice.Day -> viewModel.planOn(listOf(target.task), choice.date)
                is PlanChoice.ToHorizon -> viewModel.moveToHorizon(target.task, choice.horizon)
                PlanChoice.PickDate -> datePickFor = target
                PlanChoice.Done -> viewModel.toggle(target.task)
                PlanChoice.Open -> onOpen(target.task)
                PlanChoice.Drop -> viewModel.update(target.task.uid, TaskChange(status = TaskStatus.CANCELLED))
            }
            is ChoiceTarget.Idea -> when (choice) {
                is PlanChoice.Day -> viewModel.planIdea(target.entry, day = choice.date)
                is PlanChoice.ToHorizon -> viewModel.planIdea(target.entry, horizon = choice.horizon)
                PlanChoice.PickDate -> datePickFor = target
                else -> Unit
            }
        }
    }

    val density = LocalDensity.current
    val showTray = tray.total > 0 || ideas.isNotEmpty() || board.overdue.isNotEmpty() || triageCount > 0
    BoxWithConstraints(modifier) {
        val trayMax = maxHeight * TRAY_OPEN_FRACTION
        val bottom = navigationClearance() + Space.lg + with(density) { trayHeight.toDp() }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Space.gutter, top = Space.xs, end = Space.gutter, bottom = bottom),
        ) {
            item(key = "ai") { AiDayLink(selected) }
            item(key = "week") {
                WeekBar(
                    week = week,
                    start = start,
                    selected = selected,
                    today = today,
                    page = page,
                    onPage = ::showPage,
                    onSelect = { selectedEpoch = it.toEpochDay() },
                )
            }
            item(key = "day-header") { DayHeader(selected, week.firstOrNull { it.date == selected }) }
            items(dayItems, key = { it.key() }) { item ->
                when (item) {
                    is PlanDayItem.Card -> {
                        val task = item.card.task
                        val begin = item.startMinute?.let { selected.atStartOfDay(zone).plusMinutes(it.toLong()).toInstant() }
                        val end = begin?.let { b -> item.card.minutes?.takeIf { it > 0 }?.let { b.plusSeconds(it * 60L) } }
                        TimelineTaskRow(
                            task = task,
                            entry = TimelineEntry.Item(TodayItem.Task(task), begin, end),
                            now = moment.now,
                            zone = zone,
                            onToggle = { viewModel.toggle(task, hold = true) },
                            onOpen = { onOpen(task) },
                            onMenu = { viewModel.openMenu(task) },
                            onSwipeAction = { viewModel.swipe(task, it) },
                            pushedCount = pushedCounts[task.uid],
                        )
                    }
                    is PlanDayItem.Event -> {
                        val event = item.event
                        TimelineEventRow(
                            event = event,
                            entry = TimelineEntry.Item(
                                TodayItem.Event(event),
                                Instant.ofEpochMilli(event.event.localStart(zone)),
                                Instant.ofEpochMilli(event.event.localEnd(zone)),
                            ),
                            now = moment.now,
                            zone = zone,
                            checkable = calendarSettings.checkEvents,
                            onToggle = { viewModel.toggleEvent(event.event.key) },
                            onOpen = { viewModel.openEventDetail(event.event.key) },
                            onMenu = { viewModel.openEventMenu(event.event.key) },
                            onSwipeAction = { viewModel.swipeEvent(event, it) },
                        )
                    }
                }
            }
            if (!hideDone) {
                items(selectedDay.done, key = { "done-${it.task.rowKey}" }) { card ->
                    TimelineTaskRow(
                        task = card.task,
                        entry = TimelineEntry.Item(TodayItem.Task(card.task), null, null),
                        now = moment.now,
                        zone = zone,
                        onToggle = { viewModel.toggle(card.task, hold = true) },
                        onOpen = { onOpen(card.task) },
                        onMenu = { viewModel.openMenu(card.task) },
                        onSwipeAction = { viewModel.swipe(card.task, it) },
                        pushedCount = pushedCounts[card.task.uid],
                    )
                }
            }
            if (dayItems.isEmpty() && (hideDone || selectedDay.done.isEmpty())) {
                item(key = "day-empty") {
                    Text(
                        stringResource(R.string.plan_day_empty),
                        style = sideStyle(),
                        color = cadence.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = Space.sm),
                    )
                }
            }
        }

        if (showTray) {
            PlanTray(
                tray = tray,
                ideaCount = ideas.size,
                overdueCount = board.overdue.size,
                triageCount = triageCount,
                today = today,
                open = trayOpen,
                openHeight = trayMax,
                onOpenChange = { trayOpen = it },
                onReplan = { replanOpen = true },
                onTriage = { triageOpen = true },
                row = { task, background ->
                    ToPlaceRow(
                        task = task,
                        mark = null,
                        onToggle = { viewModel.toggle(task, hold = true) },
                        onOpen = { onOpen(task) },
                        onMenu = { viewModel.openMenu(task) },
                        onSwipeAction = { viewModel.swipe(task, it) },
                        background = background,
                        pushedCount = pushedCounts[task.uid],
                        trailing = { MoreButton(task.name) { choosing = ChoiceTarget.Task(task) } },
                    )
                },
                ideas = {
                    ideas.forEach { entry ->
                        IdeaItem(
                            entry = entry,
                            viewModel = viewModel,
                            onPlan = { choosing = ChoiceTarget.Idea(entry) },
                            modifier = Modifier.padding(vertical = Space.xs),
                        )
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = navigationClearance())
                    .onSizeChanged { if (!trayOpen) trayHeight = it.height },
            )
        }
    }

    choosing?.let { target ->
        val (title, subtitle, choices) = when (target) {
            is ChoiceTarget.Task -> {
                val task = target.task
                val parts = listOfNotNull(
                    task.projectUid?.let { projectNames[it] },
                    task.estimatedMinutes?.takeIf { it > 0 }?.let { durationText(it) },
                )
                Triple(task.name, parts.joinToString(" · ").ifEmpty { null }, PlanWeek.choices(task, today, week))
            }
            // Une idée n'est pas encore une tâche : seuls les moments s'y appliquent.
            is ChoiceTarget.Idea -> Triple(
                target.entry.content,
                null,
                PlanWeek.choices(TaskItem(uid = target.entry.uid, name = target.entry.content), today, week).copy(other = emptyList()),
            )
        }
        PlanChoiceSheet(
            title = title,
            subtitle = subtitle,
            choices = choices,
            today = today,
            onChoose = { choose(target, it) },
            onDismiss = { choosing = null },
        )
    }

    datePickFor?.let { target ->
        TaskDatePickerDialog(
            initial = today.plusDays(2),
            onConfirm = { date ->
                datePickFor = null
                when (target) {
                    is ChoiceTarget.Task -> viewModel.planOn(listOf(target.task), date)
                    is ChoiceTarget.Idea -> viewModel.planIdea(target.entry, day = date)
                }
            },
            onDismiss = { datePickFor = null },
        )
    }

    if (replanOpen) {
        OverdueReplanSheet(
            tasks = board.overdue,
            today = today,
            dayCounts = board.days.associate { it.date to it.open.size },
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

    if (triageOpen) TriageScreen(today = LocalDate.now(), onBack = { triageOpen = false })
}

private fun PlanDayItem.key(): String = when (this) {
    is PlanDayItem.Card -> "card-${card.task.rowKey}"
    is PlanDayItem.Event -> event.event.let { "event-${it.calendarId}-${it.eventId}-${it.instanceBegin}" }
}

/** « Planifier lundi avec l'IA » : un lien discret à l'accent, sans pastille. */
@Composable
private fun AiDayLink(day: LocalDate) {
    val action = rememberProposalAction(ProposalKind.WEEK, day = day)
    if (!action.visible) return
    val palette = cadence
    Row(
        Modifier
            .heightIn(min = Size.touch)
            .clickable(role = Role.Button, enabled = action.phase !is ProposalPhase.Preparing, onClick = action.onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = palette.primary, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(Space.xs))
        Text(action.label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = palette.primary)
    }
}

/** « Semaine du 16 nov. · 11 h sur 40 h », les flèches de semaine, puis la bande des 7 jours (glisser change de semaine). */
@Composable
private fun WeekBar(
    week: List<WeekDay>,
    start: LocalDate,
    selected: LocalDate,
    today: LocalDate,
    page: Int,
    onPage: (Int) -> Unit,
    onSelect: (LocalDate) -> Unit,
) {
    val palette = cadence
    val minutes = week.sumOf { it.minutes }
    val capacity = week.sumOf { it.capacityMinutes }
    val weekOf = stringResource(R.string.plan_week_of, start.format(DateTimeFormatter.ofPattern("d MMM", tasksLocale)))
    val label = if (capacity > 0) "$weekOf · ${stringResource(R.string.plan_week_load, durationText(minutes), durationText(capacity))}" else weekOf
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = sideStyle(), color = palette.onSurfaceVariant, modifier = Modifier.weight(1f))
            IconButton(onClick = { onPage(page - 1) }, enabled = page > 0) {
                Icon(Icons.Outlined.ChevronLeft, contentDescription = stringResource(R.string.plan_week_previous), modifier = Modifier.size(20.dp))
            }
            IconButton(onClick = { onPage(page + 1) }, enabled = page < PlanWeek.LAST_PAGE) {
                Icon(Icons.Outlined.ChevronRight, contentDescription = stringResource(R.string.plan_week_next), modifier = Modifier.size(20.dp))
            }
        }
        val threshold = with(LocalDensity.current) { Size.touch.toPx() }
        Row(
            Modifier
                .fillMaxWidth()
                .pointerInput(page) {
                    var total = 0f
                    detectHorizontalDragGestures(
                        onDragStart = { total = 0f },
                        onDragEnd = {
                            if (total < -threshold) onPage(page + 1) else if (total > threshold) onPage(page - 1)
                        },
                    ) { _, delta -> total += delta }
                },
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            week.forEach { day ->
                WeekCell(day, selected = day.date == selected, today = today, onClick = { onSelect(day.date) }, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** Un jour de la bande : jour court, numéro, barre de charge (rouge si plein), tâches ou « libre », points des événements. */
@Composable
private fun WeekCell(day: WeekDay, selected: Boolean, today: LocalDate, onClick: () -> Unit, modifier: Modifier) {
    val palette = cadence
    Column(
        modifier
            .clip(Radius.Control)
            .then(if (selected) Modifier.border(1.dp, palette.primary.copy(alpha = 0.45f), Radius.Control) else Modifier)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .padding(vertical = Space.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(day.date.format(DateTimeFormatter.ofPattern("EEE", tasksLocale)), style = MaterialTheme.typography.labelSmall, color = palette.onSurfaceVariant)
        Text(
            day.date.dayOfMonth.toString(),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = if (day.date == today || selected) FontWeight.SemiBold else null,
            color = if (selected) palette.primary else palette.onSurface,
        )
        Box(Modifier.width(24.dp).height(3.dp).clip(CircleShape).background(palette.outlineVariant)) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(day.load).background(if (day.full) palette.error else palette.primary))
        }
        Text(
            when {
                day.taskCount > 0 -> day.taskCount.toString()
                day.free -> stringResource(R.string.overdue_replan_day_free)
                else -> ""
            },
            style = MaterialTheme.typography.labelSmall,
            color = palette.onSurfaceVariant,
            maxLines = 1,
        )
        Row(Modifier.height(5.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            day.eventColors.forEach { argb ->
                // Une couleur d'agenda sans alpha serait transparente.
                Box(Modifier.size(5.dp).clip(CircleShape).background(Color(argb or OPAQUE)))
            }
        }
    }
}

private const val OPAQUE = 0xFF shl 24

/** « Lundi 16 novembre » à gauche, « 3 h 30 / 8 h » à droite. */
@Composable
private fun DayHeader(date: LocalDate, day: WeekDay?) {
    val title = date.format(DateTimeFormatter.ofPattern("EEEE d MMMM", tasksLocale)).replaceFirstChar { it.titlecase(tasksLocale) }
    val minutes = day?.minutes ?: 0
    val capacity = day?.capacityMinutes ?: 0
    val load = when {
        capacity > 0 -> stringResource(R.string.plan_day_load, durationText(minutes), durationText(capacity))
        minutes > 0 -> durationText(minutes)
        else -> null
    }
    Row(Modifier.fillMaxWidth().padding(top = Space.md, bottom = Space.xs), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        load?.let { Text(it, style = sideStyle(), color = cadence.onSurfaceVariant) }
    }
}

/** Le seul bouton d'une ligne du tiroir : « ⋯ », qui ouvre la feuille de choix. */
@Composable
private fun MoreButton(name: String, onClick: () -> Unit) {
    Box(
        Modifier.size(Size.touch).clickable(role = Role.Button, onClickLabel = stringResource(R.string.plan_choice_open_sheet, name), onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Outlined.MoreHoriz, contentDescription = stringResource(R.string.plan_choice_open_sheet, name), tint = cadence.onSurfaceVariant, modifier = Modifier.size(18.dp))
    }
}

/**
 * Tiroir « À placer » posé au-dessus de la barre du bas. Replié : le titre, « Replanifier les échues · N » et les
 * [TRAY_PREVIEW] premières tâches. Tirer la poignée vers le haut (ou toucher l'en-tête) le déplie à [openHeight] :
 * filtres, « À trier », tâches du filtre, et les idées de l'Inbox sous « À placer ».
 */
@Composable
private fun PlanTray(
    tray: Tray,
    ideaCount: Int,
    overdueCount: Int,
    triageCount: Int,
    today: LocalDate,
    open: Boolean,
    openHeight: Dp,
    onOpenChange: (Boolean) -> Unit,
    onReplan: () -> Unit,
    onTriage: () -> Unit,
    row: @Composable (TaskItem, Color) -> Unit,
    ideas: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val shape = RoundedCornerShape(topStart = Radius.sheet, topEnd = Radius.sheet, bottomStart = Radius.card, bottomEnd = Radius.card)
    val rowBackground = palette.containerLow
    // Les idées et « À trier » vivent sous « À placer » : le filtre reste offert tant qu'il en reste.
    val extras = ideaCount > 0 || triageCount > 0
    val filters = (tray.filters + if (extras) listOf(TrayFilter.TO_PLACE) else emptyList()).distinct().sortedBy { it.ordinal }
    var chosen by rememberSaveable { mutableStateOf(TrayFilter.TO_PLACE) }
    val filter = chosen.takeIf { it in filters } ?: filters.firstOrNull() ?: TrayFilter.TO_PLACE
    val threshold = with(LocalDensity.current) { Size.touch.toPx() }
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = Space.sm)
            .shadow(Elevation.floating, shape)
            .clip(shape)
            .background(palette.containerLow.copy(alpha = Glass.FallbackAlpha))
            .border(Size.hairline, palette.glassBorder, shape)
            .animateContentSize()
            .then(if (open) Modifier.height(openHeight) else Modifier),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .pointerInput(open) {
                    var total = 0f
                    detectVerticalDragGestures(
                        onDragStart = { total = 0f },
                        onDragEnd = { if (total < -threshold) onOpenChange(true) else if (total > threshold) onOpenChange(false) },
                    ) { _, delta -> total += delta }
                }
                .clickable(
                    role = Role.Button,
                    onClickLabel = stringResource(if (open) R.string.plan_tray_collapse else R.string.plan_tray_expand),
                ) { onOpenChange(!open) }
                .padding(horizontal = Space.gutter - Space.sm),
        ) {
            Box(
                Modifier
                    .padding(top = Space.sm)
                    .align(Alignment.CenterHorizontally)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(CircleShape)
                    .background(palette.onSurfaceVariant.copy(alpha = Glass.HandleAlpha)),
            )
            Row(Modifier.heightIn(min = Size.touch), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.plan_tray_title, tray.total + ideaCount),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (open && overdueCount > 0) PluginActionButtons(place = "overdue", context = mapOf("date" to today.toString()))
                if (overdueCount > 0) {
                    Text(
                        stringResource(R.string.plan_tray_replan, overdueCount),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.primary,
                        modifier = Modifier
                            .heightIn(min = Size.touch)
                            .clickable(role = Role.Button, onClick = onReplan)
                            .padding(horizontal = Space.xs, vertical = Space.md),
                    )
                }
            }
        }
        val inner = Modifier.padding(horizontal = Space.gutter - Space.sm)
        if (!open) {
            val preview = TrayFilter.entries.flatMap { tray.tasks[it].orEmpty() }.take(TRAY_PREVIEW)
            Column(inner.padding(bottom = Space.sm)) { preview.forEach { row(it, rowBackground) } }
            return@Column
        }
        if (filters.size > 1) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Space.gutter - Space.sm, vertical = Space.xs),
                horizontalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                filters.forEach { f ->
                    val count = tray.tasks[f].orEmpty().size + if (f == TrayFilter.TO_PLACE) ideaCount else 0
                    ChoiceChip(
                        label = stringResource(R.string.plan_filter_count, stringResource(filterLabel(f)), count),
                        selected = f == filter,
                        onClick = { chosen = f },
                    )
                }
            }
        }
        val tasks = tray.tasks[filter].orEmpty()
        LazyColumn(inner.fillMaxWidth().weight(1f), contentPadding = PaddingValues(bottom = Space.md)) {
            if (filter == TrayFilter.TO_PLACE && triageCount > 0) {
                item(key = "triage") { TriageEntry(triageCount, onOpen = onTriage) }
            }
            items(tasks, key = { "tray-${it.uid}" }) { row(it, rowBackground) }
            if (filter == TrayFilter.TO_PLACE && ideaCount > 0) item(key = "ideas") { ideas() }
            if (tasks.isEmpty() && !(filter == TrayFilter.TO_PLACE && extras)) {
                item(key = "empty") {
                    Text(
                        stringResource(R.string.plan_inbox_empty),
                        style = sideStyle(),
                        color = palette.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = Space.sm),
                    )
                }
            }
        }
    }
}

/**
 * Feuille de choix d'une tâche (ou d'une idée) : son titre et son projet · durée, « QUAND » (Aujourd'hui, Demain, les
 * jours libres, les horizons, « Date… ») puis « AUTRE » (Fait, Ouvrir la fiche, Abandonner). Un toucher écrit tout
 * de suite et ferme la feuille ; l'« Annuler » vient de l'écran.
 */
@Composable
private fun PlanChoiceSheet(
    title: String,
    subtitle: String?,
    choices: PlanChoices,
    today: LocalDate,
    onChoose: (PlanChoice) -> Unit,
    onDismiss: () -> Unit,
) {
    val palette = cadence
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = Radius.Sheet,
        containerColor = palette.background.copy(alpha = Glass.FallbackAlpha),
        modifier = Modifier.glassWindow(Radius.Sheet, palette.background, sheetOffset = sheetState::requireOffset, paints = false),
        contentColor = palette.onSurface,
        scrimColor = glassScrim(),
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Space.gutter).padding(bottom = Space.lg)) {
            Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            subtitle?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant, modifier = Modifier.padding(top = Space.xs))
            }
            val gap = Arrangement.spacedBy(Space.sm)
            TimelineSectionTitle(stringResource(R.string.plan_choice_when))
            FlowRow(Modifier.padding(top = Space.xs), horizontalArrangement = gap, verticalArrangement = gap) {
                choices.whenChoices.forEach { choice ->
                    QuickPill(choiceLabel(choice, today), onClick = { onChoose(choice) }, quiet = choice !is PlanChoice.Day)
                }
            }
            if (choices.other.isNotEmpty()) {
                TimelineSectionTitle(stringResource(R.string.plan_choice_other))
                FlowRow(Modifier.padding(top = Space.xs), horizontalArrangement = gap, verticalArrangement = gap) {
                    choices.other.forEach { choice -> QuickPill(choiceLabel(choice, today), onClick = { onChoose(choice) }, quiet = true) }
                }
            }
        }
    }
}

@Composable
private fun choiceLabel(choice: PlanChoice, today: LocalDate): String = when (choice) {
    is PlanChoice.Day -> when {
        !choice.date.isAfter(today.plusDays(1)) -> dayLabel(choice.date, today, DayLabelStyle.SHORT)
        else -> {
            val day = choice.date.format(DateTimeFormatter.ofPattern("EEE d", tasksLocale))
            if (choice.free) stringResource(R.string.plan_choice_free_day, day) else day
        }
    }
    is PlanChoice.ToHorizon -> stringResource(horizonLabel(choice.horizon))
    PlanChoice.PickDate -> stringResource(R.string.plan_choice_date)
    PlanChoice.Done -> stringResource(R.string.plan_choice_done)
    PlanChoice.Open -> stringResource(R.string.plan_choice_open)
    PlanChoice.Drop -> stringResource(R.string.plan_choice_drop)
}
