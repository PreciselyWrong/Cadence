package ch.nicolab.cadence.agenda

import androidx.compose.ui.semantics.selected
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle as ComposeTextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.designsystem.components.navigationClearance
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
private val ALL_DAY_CHIP_HEIGHT = 28.dp
/** En dessous de cette largeur de colonne (vue 3 jours), le titre passe en petit corps. */
private val NARROW_COLUMN = 160.dp
/** Écart vertical entre deux blocs qui se suivent : chacun garde son bord. */
private val BLOCK_GAP = 1.dp
/** Marge latérale d'un bloc : deux blocs côte à côte restent séparés de 4 dp. */
private val BLOCK_SIDE_GAP = 2.dp
private val BLOCK_HOUR_MINUTE: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val ALL_DAY_MORE_HEIGHT = 28.dp
/** Déplié, le bloc des journées entières défile au-delà de cette hauteur au lieu de manger la grille. */
private val ALL_DAY_EXPANDED_MAX = 168.dp
private val RESIZE_HANDLE_HEIGHT = 20.dp
private val RESIZE_GRIP_WIDTH = 28.dp
private val EDGE_SCROLL_ZONE = 56.dp
private const val EDGE_SCROLL_MAX_PX = 22f
private const val DROP_PREVIEW_ALPHA = 0.28f
private const val GRIP_ALPHA = 0.45f
private const val HOURS_PER_DAY = 24
private const val DEFAULT_START_HOUR = 8

/**
 * Vue Jour et 3 jours : en-têtes de colonnes (3 jours), rangée des journées entières,
 * puis grille horaire défilante. Les blocs gardent la couleur de leur source. Défiler la grille ne
 * change rien d'autre : le calendrier du mois s'ouvre seulement par le bouton de l'en-tête.
 */
@Composable
internal fun ColumnScope.TimeAgenda(
    state: AgendaUiState,
    now: LocalTime,
    onToggleEvent: (EventInstanceKey) -> Unit,
    drag: TrayDragState,
    onDrop: (String, LocalDateTime) -> Unit,
    onResize: (String, Int) -> Unit,
) {
    val days = remember(state.mode, state.selected, state.options.weekends) {
        if (state.mode == AgendaMode.DAY) listOf(state.selected) else threeDays(state.selected, state.options.weekends)
    }
    val layouts = remember(state.entries, days) { days.associateWith { layoutDay(state.entries, it) } }
    Column(Modifier.weight(1f)) {
        if (state.mode == AgendaMode.DAY) {
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
            // En défilant, une seule ligne : la grille reprend la place des journées entières.
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
    val colors = rememberBlockColors(entry)
    val actions = LocalAgendaEventActions.current
    val dragItem = draggableTaskItem(entry)
    val source = if (dragItem != null) Modifier.trayDragSource(dragItem, drag, onDrop) else Modifier
    Box(
        Modifier
            .fillMaxWidth()
            .height(ALL_DAY_CHIP_HEIGHT)
            .clip(Radius.Chip)
            .background(Color(colors.fill))
            .eventTouch(entry)
            .then(source),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = BLOCK_PADDING),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            EntryMark(entry, colors, checkEvents)
            Spacer(Modifier.width(MARK_GAP))
            BlockTitle(entry, colors, MaterialTheme.typography.labelMedium, maxLines = 1)
        }
        Box(
            Modifier
                .width(MARK_HIT_WIDTH)
                .fillMaxHeight()
                .markToggle(entry, checkEvents, onToggleEvent, actions.toggleTask),
        )
    }
}

/** Titre d'un bloc ou d'une puce, à l'encre lisible sur son fond ; barré une fois fait. */
@Composable
private fun BlockTitle(entry: AgendaEntry, colors: BlockColors, style: ComposeTextStyle, maxLines: Int) {
    Text(
        text = entry.title.ifBlank { stringResource(R.string.agenda_untitled) },
        style = style,
        color = Color(colors.title),
        textDecoration = if (entry.done) TextDecoration.LineThrough else null,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
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
    val entry = block.entry
    val colors = rememberBlockColors(entry)
    val actions = LocalAgendaEventActions.current
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val columnWidth = maxWidth / block.columnCount
    val task = (entry as? AgendaEntry.Task)?.takeIf { !it.done && !it.recurring }
    var liveEnd by remember(block.startMinute, block.endMinute) { mutableStateOf<Int?>(null) }
    val endMinute = liveEnd ?: block.endMinute
    val top = Size.agendaHour * (block.startMinute / 60f)
    val height = Size.agendaHour * ((endMinute - block.startMinute) / 60f)
    // Colonne étroite (3 jours, chevauchements) : un corps plus petit loge deux ou trois lignes de titre.
    val narrow = columnWidth < NARROW_COLUMN
    val titleStyle = if (narrow) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelLarge
    val timeStyle = MaterialTheme.typography.labelSmall
    val title = entry.title.ifBlank { stringResource(R.string.agenda_untitled) }
    val innerWidth = columnWidth - BLOCK_SIDE_GAP * 2 - BLOCK_PADDING * 2
    // Trop étroit pour loger le titre à côté du repère : le repère passe au-dessus du titre.
    val stacked = !markFitsBeside(innerWidth.value)
    val textWidth = if (stacked) innerWidth else innerWidth - MARK_SIZE - MARK_GAP
    val titleLine = with(density) { titleStyle.lineHeight.toDp() }
    val text = remember(title, titleStyle, textWidth, height, endMinute, density, stacked) {
        val widthPx = with(density) { textWidth.roundToPx() }.coerceAtLeast(1)
        val needed = measurer.measure(
            text = title,
            style = titleStyle,
            constraints = Constraints(maxWidth = widthPx),
            maxLines = MAX_TITLE_LINES,
        ).lineCount
        blockText(
            minutes = endMinute - block.startMinute,
            heightDp = (height - BLOCK_GAP * 2).value,
            titleLineDp = titleLine.value,
            timeLineDp = with(density) { timeStyle.lineHeight.toDp() }.value,
            neededTitleLines = needed,
            markAboveDp = if (stacked) (MARK_SIZE + MARK_GAP).value else 0f,
        )
    }
    // Bloc court et étroit : le titre seul, plutôt qu'un repère suivi de « … ».
    val showMark = !(stacked && text.inline)
    Box(
        Modifier
            .offset(x = columnWidth * block.column, y = top)
            .width(columnWidth)
            .height(height)
            .padding(horizontal = BLOCK_SIDE_GAP, vertical = BLOCK_GAP)
            .clip(Radius.Chip)
            .background(Color(colors.fill))
            .eventTouch(entry),
    ) {
        val content: @Composable () -> Unit = {
            BlockTitle(entry, colors, titleStyle, maxLines = text.titleLines)
            if (text.showTime) {
                Text(
                    text = blockTime(entry, startOnly = narrow),
                    style = timeStyle,
                    color = Color(colors.meta),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (stacked) {
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = BLOCK_PADDING, vertical = if (text.inline) 0.dp else BLOCK_PADDING),
                verticalArrangement = if (text.inline) Arrangement.Center else Arrangement.Top,
            ) {
                if (showMark) {
                    EntryMark(entry, colors, checkEvents)
                    Spacer(Modifier.height(MARK_GAP))
                }
                content()
            }
        } else {
            Row(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = BLOCK_PADDING, vertical = if (text.inline) 0.dp else BLOCK_PADDING),
                verticalAlignment = if (text.inline) Alignment.CenterVertically else Alignment.Top,
            ) {
                // Le repère s'aligne sur la première ligne du titre.
                val markTop = if (text.inline) 0.dp else ((titleLine - MARK_SIZE) / 2).coerceAtLeast(0.dp)
                EntryMark(entry, colors, checkEvents, Modifier.padding(top = markTop))
                Spacer(Modifier.width(MARK_GAP))
                Column { content() }
            }
        }
        if (task != null) {
            ResizeHandle(
                color = Color(colors.meta),
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
        // Posée en dernier, la zone de la case passe devant la poignée sur un bloc court.
        if (showMark) {
            Box(
                Modifier
                    .width(MARK_HIT_WIDTH)
                    .height(Size.touch)
                    .markToggle(entry, checkEvents, onToggleEvent, actions.toggleTask),
            )
        }
    }
}

/** Horaire d'un bloc : début et fin, ou le début seul en colonne étroite ; sans la source, le repère la dit. */
@Composable
private fun blockTime(entry: AgendaEntry, startOnly: Boolean): String =
    if (startOnly) {
        entry.start.format(BLOCK_HOUR_MINUTE)
    } else {
        stringResource(R.string.agenda_time_range, entry.start.format(BLOCK_HOUR_MINUTE), entry.end.format(BLOCK_HOUR_MINUTE))
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

private fun DayOfWeek.narrow(): String = getDisplayName(TextStyle.NARROW, Locale.FRENCH).uppercase(Locale.FRENCH)

internal fun LocalDate.isWeekend(): Boolean = dayOfWeek == DayOfWeek.SATURDAY || dayOfWeek == DayOfWeek.SUNDAY

/** Case d'une occurrence à venir : visible mais atténuée, elle ne se coche pas. */
internal const val VIRTUAL_ALPHA = 0.4f
