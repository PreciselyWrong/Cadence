package ch.nicolab.cadence.agenda

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
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
import java.time.LocalTime
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt

/** Puce de journée entière : une ligne, pour laisser la grille horaire visible. */
private val ALL_DAY_CHIP_HEIGHT = 40.dp
private const val HOURS_PER_DAY = 24
private const val DEFAULT_START_HOUR = 8
/** Glissement franc, en pixels, au-delà duquel un balayage change de semaine ou de période. */
private const val SWIPE_THRESHOLD_PX = 80f

/**
 * Vue Jour et 3 jours : bandeau des jours (ou en-têtes de colonnes), rangée des journées entières,
 * puis grille horaire défilante. Les blocs gardent la couleur de leur source.
 */
@Composable
internal fun ColumnScope.TimeAgenda(
    state: AgendaUiState,
    now: LocalTime,
    onSelect: (LocalDate) -> Unit,
    onSwipe: (Int) -> Unit,
    onSwipeWeek: (Int) -> Unit,
    onToggleEvent: (EventInstanceKey) -> Unit,
) {
    val days = remember(state.mode, state.selected) {
        if (state.mode == AgendaMode.DAY) listOf(state.selected) else List(3) { state.selected.plusDays(it.toLong()) }
    }
    val layouts = remember(state.entries, days) { days.associateWith { layoutDay(state.entries, it) } }
    val dotDays = remember(state.entries) { dotsByDay(state.entries).keys }

    if (state.mode == AgendaMode.DAY) {
        WeekStrip(
            week = weekDays(state.selected).filter { state.options.weekends || !it.isWeekend() },
            selected = state.selected,
            today = state.today,
            daysWithEntries = dotDays,
            onSelect = onSelect,
            onSwipeWeek = onSwipeWeek,
        )
    } else {
        DayColumnHeaders(days = days, today = state.today, onSwipe = onSwipe)
    }
    AllDayRow(days = days, layouts = layouts, checkEvents = state.checkEvents, onToggleEvent = onToggleEvent)
    TimeGrid(
        days = days,
        layouts = layouts,
        today = state.today,
        now = now,
        compactHours = state.mode != AgendaMode.DAY,
        checkEvents = state.checkEvents,
        onToggleEvent = onToggleEvent,
        modifier = Modifier.weight(1f),
    )
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
            .padding(top = Space.md)
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
    Column(
        modifier
            .clip(Radius.Chip)
            .clickable(role = Role.Button, onClick = onClick)
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
private fun DayColumnHeaders(days: List<LocalDate>, today: LocalDate, onSwipe: (Int) -> Unit) {
    val palette = cadence
    val swipe = rememberHorizontalSwipe(onSwipe)
    Row(Modifier.fillMaxWidth().padding(top = Space.md).then(swipe)) {
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

/** Journées entières de la plage, empilées par colonne. La rangée disparaît quand elle est vide. */
@Composable
private fun AllDayRow(
    days: List<LocalDate>,
    layouts: Map<LocalDate, DayLayout>,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
) {
    if (days.none { layouts[it]?.allDay?.isNotEmpty() == true }) return
    val palette = cadence
    Row(Modifier.fillMaxWidth().padding(vertical = Space.xs)) {
        Text(
            text = stringResource(R.string.agenda_all_day_row),
            style = MaterialTheme.typography.labelSmall,
            color = palette.onSurfaceVariant,
            maxLines = 1,
            softWrap = false,
            textAlign = TextAlign.End,
            modifier = Modifier.width(Size.agendaGutter).padding(top = Space.sm, end = Space.xs),
        )
        days.forEach { day ->
            Column(Modifier.weight(1f).padding(horizontal = Space.xs), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                layouts[day]?.allDay.orEmpty().forEach { entry ->
                    AllDayChip(entry = entry, checkEvents = checkEvents, onToggleEvent = onToggleEvent)
                }
            }
        }
    }
}

@Composable
private fun AllDayChip(entry: AgendaEntry, checkEvents: Boolean, onToggleEvent: (EventInstanceKey) -> Unit) {
    val palette = cadence
    val color = entry.colorArgb?.let { Color(it) } ?: palette.primary
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radius.Chip)
            .background(color.copy(alpha = Glass.BadgeAlpha))
            .alpha(if (entry.done) DONE_ALPHA else 1f),
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
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val density = LocalDensity.current
    val startHour = if (today in days) (now.hour - 1).coerceAtLeast(0) else DEFAULT_START_HOUR
    val scroll = rememberScrollState(initial = with(density) { (Size.agendaHour * startHour).toPx().roundToInt() })
    val gridHeight = Size.agendaHour * HOURS_PER_DAY
    val lineColor = palette.outlineVariant
    val navClearance = navigationClearance()

    Row(modifier.verticalScroll(scroll).padding(bottom = navClearance)) {
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
                        TimedBlockView(block = block, checkEvents = checkEvents, onToggleEvent = onToggleEvent)
                    }
                    if (day == today) NowLine(now)
                }
            }
        }
    }
}

/** Bloc horaire : largeur d'une colonne du groupe qui se chevauche, hauteur proportionnelle à sa durée. */
@Composable
private fun BoxWithConstraintsScope.TimedBlockView(
    block: TimedBlock,
    checkEvents: Boolean,
    onToggleEvent: (EventInstanceKey) -> Unit,
) {
    val palette = cadence
    val entry = block.entry
    val color = entry.colorArgb?.let { Color(it) } ?: palette.primary
    val columnWidth = maxWidth / block.columnCount
    val top = Size.agendaHour * (block.startMinute / 60f)
    val height = Size.agendaHour * ((block.endMinute - block.startMinute) / 60f)
    val checkable = (entry as? AgendaEntry.Event)?.takeIf { checkEvents && height >= Size.actionSm }
    Row(
        Modifier
            .offset(x = columnWidth * block.column, y = top)
            .width(columnWidth)
            .height(height)
            .padding(horizontal = Space.xs)
            .clip(Radius.Chip)
            .background(color.copy(alpha = Glass.BadgeAlpha))
            .alpha(if (entry.done) DONE_ALPHA else 1f),
    ) {
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
