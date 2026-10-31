package ch.nicolab.cadence.agenda

import androidx.compose.ui.semantics.selected
import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.readableTintOf
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.designsystem.components.EventCheck
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.collectLatest

/** Puce de journée entière : une ligne, pour laisser la grille horaire visible. */
private val ALL_DAY_CHIP_HEIGHT = 32.dp
private val ALL_DAY_MORE_HEIGHT = 28.dp
/** Déplié, le bloc des journées entières défile au-delà de cette hauteur au lieu de manger la grille. */
private val ALL_DAY_EXPANDED_MAX = 168.dp
private val RESIZE_HANDLE_HEIGHT = 20.dp
private val RESIZE_GRIP_WIDTH = 28.dp
private val COLLAPSED_DATE_HEIGHT = 32.dp
private val COLLAPSE_TRAVEL = 36.dp
private val EDGE_SCROLL_ZONE = 56.dp
private const val EDGE_SCROLL_MAX_PX = 22f
private const val DROP_PREVIEW_ALPHA = 0.28f
private const val GRIP_ALPHA = 0.45f
private const val HOURS_PER_DAY = 24
private const val DEFAULT_START_HOUR = 8
/** Glissement franc, en pixels, au-delà duquel un balayage change de semaine ou de période. */
private const val SWIPE_THRESHOLD_PX = 80f
private val SHORT_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d MMM", Locale.FRENCH)

/**
 * Vue Jour et 3 jours : bandeau des jours (ou en-têtes de colonnes), rangée des journées entières,
 * puis grille horaire défilante. Les blocs gardent la couleur de leur source. Faire défiler la grille
 * replie le bandeau de la semaine en une ligne : la grille prend la place libérée.
 */
@Composable
internal fun ColumnScope.TimeAgenda(
    state: AgendaUiState,
    now: LocalTime,
    onSelect: (LocalDate) -> Unit,
    onSwipeWeek: (Int) -> Unit,
    onToggleEvent: (EventInstanceKey) -> Unit,
    drag: TrayDragState,
    onDrop: (String, LocalDateTime) -> Unit,
    onResize: (String, Int) -> Unit,
) {
    val days = remember(state.mode, state.selected, state.options.weekends) {
        if (state.mode == AgendaMode.DAY) listOf(state.selected) else threeDays(state.selected, state.options.weekends)
    }
    val layouts = remember(state.entries, days) { days.associateWith { layoutDay(state.entries, it) } }
    val dotDays = remember(state.entries) { dotsByDay(state.entries).keys }
    var collapse by remember { mutableStateOf(ScrollCollapse()) }
    val travelPx = with(LocalDensity.current) { COLLAPSE_TRAVEL.toPx() }
    val connection = remember(travelPx) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                collapse = collapse.after(available.y, travelPx)
                return Offset.Zero
            }
        }
    }

    Column(Modifier.weight(1f).nestedScroll(connection)) {
        if (state.mode == AgendaMode.DAY) {
            AnimatedContent(targetState = collapse.collapsed, label = "weekStrip") { collapsed ->
                if (collapsed) {
                    CollapsedDate(day = state.selected, onExpand = { collapse = ScrollCollapse() })
                } else {
                    WeekStrip(
                        week = weekDays(state.selected).filter { state.options.weekends || !it.isWeekend() },
                        selected = state.selected,
                        today = state.today,
                        daysWithEntries = dotDays,
                        onSelect = onSelect,
                        onSwipeWeek = onSwipeWeek,
                    )
                }
            }
            TrayRow(items = state.tray, drag = drag, onDrop = onDrop)
        } else {
            DayColumnHeaders(days = days, today = state.today)
        }
        AllDayRow(
            days = days,
            layouts = layouts,
            checkEvents = state.checkEvents,
            onToggleEvent = onToggleEvent,
            drag = drag,
            onDrop = onDrop,
        )
        TimeGrid(
            days = days,
            layouts = layouts,
            today = state.today,
            now = now,
            compactHours = state.mode != AgendaMode.DAY,
            checkEvents = state.checkEvents,
            onToggleEvent = onToggleEvent,
            drag = drag,
            onResize = onResize,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Bandeau replié : la date du jour choisi sur une ligne ; un toucher rouvre la semaine. */
@Composable
private fun CollapsedDate(day: LocalDate, onExpand: () -> Unit) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .height(COLLAPSED_DATE_HEIGHT)
            .clip(Radius.Chip)
            .clickable(role = Role.Button, onClickLabel = stringResource(R.string.agenda_week_expand), onClick = onExpand),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = day.format(SHORT_DATE).replaceFirstChar { it.titlecase(Locale.FRENCH) },
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurface,
            modifier = Modifier.weight(1f),
        )
        Icon(Icons.Outlined.ExpandMore, contentDescription = null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
    }
}

@Composable
private fun WeekStrip(
    week: List<LocalDate>,
    selected: LocalDate,
    today: LocalDate,
    daysWithEntries: Set<LocalDate>,
    onSelect: (LocalDate) -> Unit,
    onSwipeWeek: (Int) -> Unit,
) {
    val swipe = rememberHorizontalSwipe(onSwipeWeek)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = Space.sm)
            .then(swipe),
    ) {
        week.forEach { day ->
            DayCell(
                day = day,
                selected = day == selected,
                today = day == today,
                hasEntries = day in daysWithEntries,
                onClick = { onSelect(day) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun DayCell(
    day: LocalDate,
    selected: Boolean,
    today: Boolean,
    hasEntries: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    // « M 27 » ne dit pas si c'est mardi ou mercredi : le lecteur d'écran entend la date entière.
    val description = day.agendaDayDescription()
    Column(
        modifier
            .clip(Radius.Chip)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                this.selected = selected
            }
            .padding(vertical = Space.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = day.dayOfWeek.narrow(),
            style = MaterialTheme.typography.labelMedium,
            color = palette.onSurfaceVariant,
        )
        Spacer(Modifier.height(Space.xs))
        Box(
            Modifier
                .size(Size.actionSm)
                .clip(Radius.Pill)
                .background(if (selected) palette.primary else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = day.dayOfMonth.toString(),
                style = MaterialTheme.typography.titleMedium,
                color = when {
                    selected -> palette.onPrimary
                    today -> palette.primary
                    else -> palette.onSurface
                },
            )
        }
        Spacer(Modifier.height(Space.xs))
        Box(
            Modifier
                .size(Size.agendaDot)
                .clip(Radius.Pill)
                .background(if (hasEntries) palette.primary else Color.Transparent),
        )
    }
}

@Composable
private fun DayColumnHeaders(days: List<LocalDate>, today: LocalDate) {
    val palette = cadence
    Row(Modifier.fillMaxWidth().padding(top = Space.sm)) {
        Spacer(Modifier.width(Size.agendaGutter))
        days.forEach { day ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = day.dayOfWeek.narrow(),
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.onSurfaceVariant,
                )
                Box(
                    Modifier
                        .size(Size.actionSm)
                        .clip(Radius.Pill)
                        .background(if (day == today) palette.primary else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = day.dayOfMonth.toString(),
                        style = MaterialTheme.typography.titleMedium,
                        color = if (day == today) palette.onPrimary else palette.onSurface,
                    )
                }
            }
        }
    }
}

/**
 * Journées entières de la plage, empilées par colonne : deux puces au plus par colonne puis « +N ».
 * Un toucher sur « +N » déplie (la rangée défile au-delà d'une hauteur bornée) ; la rangée disparaît quand elle est vide.
 * Une tâche de la rangée se glisse sur la grille comme une pastille du bac.
 */
@Composable
private fun AllDayRow(
    days: List<LocalDate>,
    layouts: Map<LocalDate, DayLayout>,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
    drag: TrayDragState,
    onDrop: (String, LocalDateTime) -> Unit,
) {
    val columns = days.map { layouts[it]?.allDay.orEmpty() }
    if (columns.all { it.isEmpty() }) return
    val palette = cadence
    var expanded by remember(days) { mutableStateOf(false) }
    val overflowing = columns.any { it.size > ALL_DAY_MAX_ROWS }
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = Space.xs)
            .heightIn(max = ALL_DAY_EXPANDED_MAX)
            .verticalScroll(rememberScrollState()),
    ) {
        Column(Modifier.width(Size.agendaGutter).padding(end = Space.xs), horizontalAlignment = Alignment.End) {
            // La gouttière des heures (44 dp) ne loge aucun mot entier : une icône nommée remplace « Jour. ».
            Icon(
                Icons.Outlined.WbSunny,
                contentDescription = stringResource(R.string.agenda_all_day),
                tint = palette.onSurfaceVariant,
                modifier = Modifier.padding(top = Space.sm).size(Size.iconSm),
            )
            if (expanded && overflowing) {
                Icon(
                    Icons.Outlined.ExpandLess,
                    contentDescription = stringResource(R.string.agenda_all_day_less),
                    tint = palette.onSurfaceVariant,
                    modifier = Modifier
                        .clip(Radius.Pill)
                        .clickable(role = Role.Button) { expanded = false }
                        .padding(Space.xs)
                        .size(Size.icon),
                )
            }
        }
        columns.forEach { entries ->
            val cap = capAllDay(entries, expanded)
            Column(Modifier.weight(1f).padding(horizontal = Space.xs), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                cap.visible.forEach { entry ->
                    AllDayChip(entry = entry, checkEvents = checkEvents, onToggleEvent = onToggleEvent, drag = drag, onDrop = onDrop)
                }
                if (cap.hidden > 0) MoreChip(hidden = cap.hidden, onClick = { expanded = true })
            }
        }
    }
}

@Composable
private fun MoreChip(hidden: Int, onClick: () -> Unit) {
    val palette = cadence
    Box(
        Modifier
            .fillMaxWidth()
            .height(ALL_DAY_MORE_HEIGHT)
            .clip(Radius.Chip)
            .background(palette.containerHigh)
            .clickable(
                role = Role.Button,
                onClickLabel = stringResource(R.string.agenda_all_day_more_description, hidden),
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.agenda_all_day_more, hidden),
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurfaceVariant,
        )
    }
}

@Composable
private fun AllDayChip(
    entry: AgendaEntry,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
    drag: TrayDragState,
    onDrop: (String, LocalDateTime) -> Unit,
) {
    val palette = cadence
    // Couleur d'agenda ou de projet : rail, cercle et teinte restent visibles (3:1) en clair comme en sombre.
    val color = readableTintOf(entry.colorArgb?.let { Color(it) } ?: palette.primary, minContrast = ICON_CONTRAST)
    val dragItem = draggableTaskItem(entry)
    val source = if (dragItem != null) Modifier.trayDragSource(dragItem, drag, onDrop) else Modifier
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Chip)
            .background(color.copy(alpha = Glass.BadgeAlpha))
            .alpha(if (entry.done) DONE_ALPHA else 1f)
            .then(source),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(Size.rail).height(ALL_DAY_CHIP_HEIGHT).background(color))
        if (entry is AgendaEntry.Event && checkEvents) {
            EventCheckSlot(
                entry = entry,
                color = color,
                onToggleEvent = onToggleEvent,
                modifier = Modifier.size(ALL_DAY_CHIP_HEIGHT),
            )
        }
        Text(
            text = entry.title.ifBlank { stringResource(R.string.agenda_untitled) },
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurface,
            textDecoration = if (entry.done) TextDecoration.LineThrough else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = Space.sm),
        )
    }
}

@Composable
private fun TimeGrid(
    days: List<LocalDate>,
    layouts: Map<LocalDate, DayLayout>,
    today: LocalDate,
    now: LocalTime,
    compactHours: Boolean,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
    drag: TrayDragState,
    onResize: (String, Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val density = LocalDensity.current
    val startHour = if (today in days) (now.hour - 1).coerceAtLeast(0) else DEFAULT_START_HOUR
    val scroll = rememberScrollState(initial = with(density) { (Size.agendaHour * startHour).toPx().roundToInt() })
    val gridHeight = Size.agendaHour * HOURS_PER_DAY
    val lineColor = palette.outlineVariant
    val navClearance = navigationClearance()
    val hourHeightPx = with(density) { Size.agendaHour.toPx() }
    val gutterPx = with(density) { Size.agendaGutter.toPx() }
    val edgePx = with(density) { EDGE_SCROLL_ZONE.toPx() }
    SideEffect {
        drag.scroll = scroll
        drag.days = days
        drag.hourHeightPx = hourHeightPx
        drag.gutterPx = gutterPx
    }
    // Pendant un glisser, le doigt près du bord haut ou bas fait défiler la grille vers l'heure visée.
    LaunchedEffect(drag, scroll) {
        snapshotFlow { drag.item != null }.collectLatest { dragging ->
            if (!dragging) return@collectLatest
            while (true) {
                withFrameNanos { }
                val rect = drag.grid ?: continue
                val y = drag.pointer.y
                val step = when {
                    y < rect.top + edgePx -> -EDGE_SCROLL_MAX_PX * ((rect.top + edgePx - y) / edgePx).coerceIn(0f, 1f)
                    y > rect.bottom - edgePx -> EDGE_SCROLL_MAX_PX * ((y - (rect.bottom - edgePx)) / edgePx).coerceIn(0f, 1f)
                    else -> 0f
                }
                if (step != 0f) scroll.scrollBy(step)
            }
        }
    }

    Row(
        modifier
            .onGloballyPositioned { drag.grid = it.boundsInRoot() }
            .verticalScroll(scroll)
            .padding(bottom = navClearance),
    ) {
        Column(Modifier.width(Size.agendaGutter).height(gridHeight)) {
            repeat(HOURS_PER_DAY) { hour ->
                Box(Modifier.height(Size.agendaHour).fillMaxWidth()) {
                    Text(
                        text = if (compactHours) "%02d".format(hour) else "%02d:00".format(hour),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onSurfaceVariant,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().padding(end = Space.xs),
                    )
                }
            }
        }
        days.forEachIndexed { index, day ->
            val layout = layouts[day] ?: DayLayout(emptyList(), emptyList())
            Box(
                Modifier
                    .weight(1f)
                    .height(gridHeight)
                    .drawBehind {
                        val hairline = Size.hairline.toPx()
                        repeat(HOURS_PER_DAY + 1) { hour ->
                            val y = (Size.agendaHour.toPx() * hour)
                            drawLine(lineColor, Offset(0f, y), Offset(size.width, y), strokeWidth = hairline)
                        }
                        if (index > 0) {
                            drawLine(lineColor, Offset(0f, 0f), Offset(0f, size.height), strokeWidth = hairline)
                        }
                    },
            ) {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    layout.timed.forEach { block ->
                        TimedBlockView(
                            block = block,
                            checkEvents = checkEvents,
                            onToggleEvent = onToggleEvent,
                            hourHeightPx = hourHeightPx,
                            onResize = onResize,
                        )
                    }
                    val dragged = drag.item
                    val target = drag.target
                    if (dragged != null && target != null && target.toLocalDate() == day) {
                        DropPreview(
                            startMinute = target.hour * 60 + target.minute,
                            minutes = dropBlockMinutes(dragged.estimateMinutes),
                            color = dragged.colorArgb?.let { Color(it) } ?: palette.primary,
                        )
                    }
                    if (day == today) NowLine(now)
                }
            }
        }
    }
}

/** Créneau visé par le doigt : un bloc fantôme de la durée de la tâche, calé sur le cran de 15 minutes. */
@Composable
private fun BoxWithConstraintsScope.DropPreview(startMinute: Int, minutes: Int, color: Color) {
    Box(
        Modifier
            .offset(y = Size.agendaHour * (startMinute / 60f))
            .fillMaxWidth()
            .height(Size.agendaHour * (minutes / 60f))
            .padding(horizontal = Space.xs)
            .clip(Radius.Chip)
            .background(color.copy(alpha = DROP_PREVIEW_ALPHA))
            .border(Size.stroke, color, Radius.Chip),
    )
}

/**
 * Bloc horaire : largeur d'une colonne du groupe qui se chevauche, hauteur proportionnelle à sa durée.
 * Une tâche à faire se redimensionne par son bord bas, par crans de 15 minutes, ce qui écrit son estimation.
 */
@Composable
private fun BoxWithConstraintsScope.TimedBlockView(
    block: TimedBlock,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
    hourHeightPx: Float,
    onResize: (String, Int) -> Unit,
) {
    val palette = cadence
    val entry = block.entry
    // Couleur d'agenda ou de projet : rail, cercle et teinte restent visibles (3:1) en clair comme en sombre.
    val color = readableTintOf(entry.colorArgb?.let { Color(it) } ?: palette.primary, minContrast = ICON_CONTRAST)
    val columnWidth = maxWidth / block.columnCount
    val task = (entry as? AgendaEntry.Task)?.takeIf { !it.done && !it.recurring }
    var liveEnd by remember(block.startMinute, block.endMinute) { mutableStateOf<Int?>(null) }
    val endMinute = liveEnd ?: block.endMinute
    val top = Size.agendaHour * (block.startMinute / 60f)
    val height = Size.agendaHour * ((endMinute - block.startMinute) / 60f)
    val checkable = (entry as? AgendaEntry.Event)?.takeIf { checkEvents && height >= Size.actionSm }
    Box(
        Modifier
            .offset(x = columnWidth * block.column, y = top)
            .width(columnWidth)
            .height(height)
            .padding(horizontal = Space.xs)
            .clip(Radius.Chip)
            .background(color.copy(alpha = Glass.BadgeAlpha))
            .alpha(if (entry.done) DONE_ALPHA else 1f),
    ) {
        Row(Modifier.fillMaxSize()) {
            Box(Modifier.width(Size.rail).fillMaxHeight().background(color))
            checkable?.let { EventCheckSlot(entry = it, color = color, onToggleEvent = onToggleEvent) }
            Column(Modifier.padding(horizontal = Space.sm, vertical = Space.xs)) {
                Text(
                    text = entry.title.ifBlank { stringResource(R.string.agenda_untitled) },
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.onSurface,
                    textDecoration = if (entry.done) TextDecoration.LineThrough else null,
                    maxLines = if (height >= Size.touch) 2 else 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (height >= Size.touch * 1.25f) {
                    Text(
                        text = agendaMeta(entry),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (task != null) {
            ResizeHandle(
                color = palette.onSurface,
                startMinute = block.startMinute,
                baseMinutes = block.endMinute - block.startMinute,
                hourHeightPx = hourHeightPx,
                onPreview = { liveEnd = block.startMinute + it },
                onCommit = { minutes ->
                    if (minutes == block.endMinute - block.startMinute) liveEnd = null else onResize(task.uid, minutes)
                },
                onCancel = { liveEnd = null },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

/** Poignée du bord bas : un glissement vertical change la durée par crans, avec un tic à chaque cran. */
@Composable
private fun ResizeHandle(
    color: Color,
    startMinute: Int,
    baseMinutes: Int,
    hourHeightPx: Float,
    onPreview: (Int) -> Unit,
    onCommit: (Int) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val view = LocalView.current
    val label = stringResource(R.string.agenda_resize_handle)
    val latestPreview by rememberUpdatedState(onPreview)
    val latestCommit by rememberUpdatedState(onCommit)
    val latestCancel by rememberUpdatedState(onCancel)
    Box(
        modifier
            .fillMaxWidth()
            .height(RESIZE_HANDLE_HEIGHT)
            .semantics { contentDescription = label }
            .pointerInput(startMinute, baseMinutes, hourHeightPx) {
                var travel = 0f
                var current = baseMinutes
                detectVerticalDragGestures(
                    onDragStart = {
                        travel = 0f
                        current = baseMinutes
                    },
                    onDragEnd = { latestCommit(current) },
                    onDragCancel = { latestCancel() },
                ) { change, amount ->
                    change.consume()
                    travel += amount
                    val minutes = resizedMinutes(startMinute, baseMinutes, travel, hourHeightPx)
                    if (minutes != current) {
                        current = minutes
                        view.performHapticFeedback(snapTickConstant())
                        latestPreview(minutes)
                    }
                }
            },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Box(
            Modifier
                .padding(bottom = Space.xs)
                .width(RESIZE_GRIP_WIDTH)
                .height(Size.stroke)
                .clip(Radius.Pill)
                .background(color.copy(alpha = GRIP_ALPHA)),
        )
    }
}

@Composable
private fun EventCheckSlot(
    entry: AgendaEntry.Event,
    color: Color,
    onToggleEvent: (EventInstanceKey) -> Unit,
    modifier: Modifier = Modifier,
) {
    EventCheck(
        checked = entry.done,
        color = color,
        onCheckedChange = { onToggleEvent(entry.eventKey) },
        modifier = Modifier.padding(start = Space.xs).then(modifier),
        contentDescription = stringResource(
            if (entry.done) R.string.agenda_mark_undone else R.string.agenda_mark_done,
        ),
    )
}

@Composable
private fun BoxWithConstraintsScope.NowLine(now: LocalTime) {
    val palette = cadence
    val top = Size.agendaHour * ((now.hour * 60 + now.minute) / 60f)
    Box(
        Modifier
            .offset(y = top)
            .fillMaxWidth()
            .height(Size.stroke)
            .background(palette.error),
    )
    Box(
        Modifier
            .offset(x = -Size.agendaDot / 2, y = top - Size.agendaDot / 2 + Size.stroke / 2)
            .size(Size.agendaDot)
            .clip(Radius.Pill)
            .background(palette.error),
    )
}

/** Balayage horizontal sans conflit avec le défilement vertical : seul le glissement franc déclenche l'action. */
@Composable
internal fun rememberHorizontalSwipe(onSwipe: (Int) -> Unit): Modifier {
    val latest by rememberUpdatedState(onSwipe)
    return Modifier.pointerInput(Unit) {
        var total = 0f
        detectHorizontalDragGestures(
            onDragStart = { total = 0f },
            onDragEnd = {
                when {
                    total > SWIPE_THRESHOLD_PX -> latest(-1)
                    total < -SWIPE_THRESHOLD_PX -> latest(1)
                }
            },
        ) { _, amount -> total += amount }
    }
}

private fun DayOfWeek.narrow(): String = getDisplayName(TextStyle.NARROW, Locale.FRENCH).uppercase(Locale.FRENCH)

internal fun LocalDate.isWeekend(): Boolean = dayOfWeek == DayOfWeek.SATURDAY || dayOfWeek == DayOfWeek.SUNDAY

internal const val DONE_ALPHA = 0.55f
