package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.swipe.EventActions
import ch.nicolab.cadence.tasks.swipe.FileBackedActions
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.rememberSwipeConfig
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// Mesures de la maquette « ligne du temps compacte » : lignes de 40 dp, titre 15 sp, repères de 18 dp.
private val HourWidth = 40.dp
private val AxisWidth = 28.dp
private val RowHeight = 40.dp
private val MarkSize = 18.dp
private const val PAST_ALPHA = 0.38f
private val hourFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("H:mm")

@Composable
private fun titleStyle(): TextStyle = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 20.sp)

@Composable
internal fun sideStyle(): TextStyle = MaterialTheme.typography.labelMedium.copy(fontSize = 12.5.sp)

/** Titre de section discret : « À CASER », « MA JOURNÉE », et un complément à droite. */
@Composable
internal fun TimelineSectionTitle(text: String, trailing: String? = null) {
    Row(Modifier.fillMaxWidth().padding(top = Space.md, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text.uppercase(),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.4.sp),
            color = cadence.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        trailing?.let { Text(it, style = sideStyle(), color = cadence.onSurfaceVariant) }
    }
}

/**
 * Case de la ligne du temps : un cercle de 18 dp (bord rouge pour la priorité haute, seul signal de priorité), plein
 * et coché une fois faite ; zone tactile de la hauteur de la ligne. Son fond masque l'axe dessous.
 */
@Composable
private fun SmallCheck(checked: Boolean, highPriority: Boolean, onToggle: () -> Unit) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    val label = stringResource(if (checked) R.string.tasks_mark_undone else R.string.tasks_mark_done)
    Box(
        Modifier
            .size(RowHeight)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = {
                if (it) haptic.confirm() else haptic.tap()
                onToggle()
            })
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(MarkSize)
                .clip(CircleShape)
                .background(if (checked) palette.primary else MaterialTheme.colorScheme.surface)
                .border(1.75.dp, if (checked) palette.primary else if (highPriority) palette.error else palette.outline, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) Icon(Icons.Outlined.Check, null, tint = palette.onPrimary, modifier = Modifier.size(12.dp))
        }
    }
}

/** Décale l'élément de [inset] vers la gauche sans changer la place qu'il laisse aux suivants. */
private fun Modifier.bleedStart(inset: Dp): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    val extra = inset.roundToPx()
    layout(placeable.width - extra, placeable.height) { placeable.placeRelative(-extra, 0) }
}

/** Squelette d'une ligne de la journée : heure, axe (trait continu et repère), contenu. */
@Composable
private fun TimelineScaffold(
    hour: String?,
    modifier: Modifier = Modifier,
    hourColor: Color = cadence.onSurfaceVariant,
    marker: @Composable () -> Unit = {},
    content: @Composable RowScope.() -> Unit,
) {
    val line = cadence.outlineVariant
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = RowHeight)
            .drawBehind {
                val x = (HourWidth + AxisWidth / 2).toPx()
                drawLine(line, Offset(x, 0f), Offset(x, size.height), strokeWidth = 1.5.dp.toPx())
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            hour.orEmpty(),
            style = sideStyle(),
            color = hourColor,
            textAlign = TextAlign.End,
            maxLines = 1,
            modifier = Modifier.width(HourWidth),
        )
        Box(Modifier.width(AxisWidth), contentAlignment = Alignment.Center) { marker() }
        Spacer(Modifier.width(Space.sm))
        content()
    }
}

/** Le trait « maintenant » : l'heure en rouge, un point sur l'axe et une ligne qui traverse. */
@Composable
internal fun TimelineNowRow(now: Instant, zone: ZoneId) {
    val red = cadence.error
    // Un seul trait, du point de l'axe jusqu'au bord droit.
    TimelineScaffold(
        hour = now.atZone(zone).format(hourFormat),
        hourColor = red,
        marker = { Box(Modifier.size(8.dp).clip(CircleShape).background(red)) },
        modifier = Modifier.heightIn(max = 22.dp).drawBehind {
            val x = (HourWidth + AxisWidth / 2).toPx()
            drawLine(red, Offset(x, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = 1.5.dp.toPx())
        },
    ) {
        Spacer(Modifier.weight(1f))
    }
}

/** Temps libre devant soi : « 4 h 35 libres », et « Caser les N ici » s'il reste des tâches à caser. */
@Composable
internal fun TimelineFreeRow(free: TimelineEntry.Free, placeCount: Int, onPlace: () -> Unit) {
    TimelineScaffold(hour = null) {
        Text(
            stringResource(R.string.today_free_time, durationText(free.minutes)),
            style = sideStyle(),
            color = cadence.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        if (placeCount > 0) {
            Box(Modifier.heightIn(min = RowHeight).clickable(role = Role.Button, onClick = onPlace), contentAlignment = Alignment.Center) {
                Text(
                    pluralStringResource(R.plurals.today_place_here, placeCount, placeCount),
                    style = sideStyle(),
                    color = cadence.primary,
                    modifier = Modifier
                        .clip(Radius.Pill)
                        .border(1.dp, cadence.primary.copy(alpha = 0.45f), Radius.Pill)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}

/** Repère de droite : « dans 4 h 35 » pour la prochaine chose, sinon [fallback]. */
@Composable
private fun RightMark(entry: TimelineEntry.Item, now: Instant, fallback: String?) {
    val text = if (entry.next && entry.start != null) {
        stringResource(R.string.today_in, durationText(Duration.between(now, entry.start).toMinutes().toInt().coerceAtLeast(1)))
    } else {
        fallback
    }
    text?.let {
        Text(
            it,
            style = sideStyle(),
            color = if (entry.next) cadence.primary else cadence.onSurfaceVariant,
            fontWeight = if (entry.next) FontWeight.SemiBold else null,
            maxLines = 1,
            modifier = Modifier.padding(start = Space.sm),
        )
    }
}

/** Titre, en demi-gras pour la prochaine chose, suivi de « en même temps » s'il chevauche. */
@Composable
private fun TimelineTitle(title: String, entry: TimelineEntry.Item, struck: Boolean, modifier: Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(
            title,
            style = titleStyle(),
            fontWeight = if (entry.next) FontWeight.SemiBold else null,
            textDecoration = if (struck) TextDecoration.LineThrough else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (entry.overlaps) {
            Text(" · " + stringResource(R.string.today_overlap), style = MaterialTheme.typography.labelSmall, color = cadence.warning, maxLines = 1)
        }
    }
}

/** Ligne d'« À caser » : case, titre, repère à droite (« 15 min », « prévue 10:30 »), aux mesures de la journée. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ToPlaceRow(
    task: TaskItem,
    mark: String?,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onMenu: () -> Unit,
    onSwipeAction: (SwipeAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = rememberCadenceHaptic()
    val swipeConfig = rememberSwipeConfig()
    var checking by remember { mutableStateOf(false) }
    SwipeActionContainer(
        config = remember(task.fileBacked, swipeConfig) { FileBackedActions.swipeConfig(task, swipeConfig) },
        closed = task.isClosed,
        onAction = onSwipeAction,
        shape = Radius.Control,
        modifier = modifier,
    ) { swipeSemantics ->
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = RowHeight)
                .background(MaterialTheme.colorScheme.surface)
                .then(swipeSemantics)
                .combinedClickable(onClick = onOpen, onLongClick = { haptic.longPress(); onMenu() }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Le cercle s'aligne sur la marge : la zone tactile déborde à gauche de son vide.
            Box(Modifier.bleedStart((RowHeight - MarkSize) / 2)) {
                SmallCheck(checking || task.isClosed, task.priority == TaskPriority.HIGH) {
                    checking = !checking
                    onToggle()
                }
            }
            Spacer(Modifier.width(2.dp))
            Text(
                task.name,
                style = titleStyle(),
                textDecoration = if (checking || task.isClosed) TextDecoration.LineThrough else null,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            val right = mark ?: task.estimatedMinutes?.takeIf { it > 0 }?.let { durationText(it) }
            right?.let { Text(it, style = sideStyle(), color = cadence.onSurfaceVariant, modifier = Modifier.padding(start = Space.sm)) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun TimelineTaskRow(
    task: TaskItem,
    entry: TimelineEntry.Item,
    now: Instant,
    zone: ZoneId,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onMenu: () -> Unit,
    onSwipeAction: (SwipeAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = rememberCadenceHaptic()
    val swipeConfig = rememberSwipeConfig()
    var checking by remember { mutableStateOf(false) }
    SwipeActionContainer(
        config = remember(task.fileBacked, swipeConfig) { FileBackedActions.swipeConfig(task, swipeConfig) },
        closed = task.isClosed,
        onAction = onSwipeAction,
        shape = Radius.Control,
        modifier = modifier,
    ) { swipeSemantics ->
        TimelineScaffold(
            hour = entry.start?.atZone(zone)?.format(hourFormat),
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface)
                .then(swipeSemantics)
                .combinedClickable(onClick = onOpen, onLongClick = { haptic.longPress(); onMenu() })
                .alpha(if (entry.past) PAST_ALPHA else 1f),
            marker = {
                SmallCheck(checking || task.isClosed, task.priority == TaskPriority.HIGH) {
                    checking = !checking
                    onToggle()
                }
            },
        ) {
            TimelineTitle(task.name, entry, struck = checking || task.isClosed, modifier = Modifier.weight(1f))
            // Une tâche commencée et pas encore échue le dit, plutôt qu'une durée.
            val ongoing = entry.start != null && entry.end != null && !entry.start.isAfter(now) && entry.end.isAfter(now)
            if (ongoing) {
                Text(stringResource(R.string.today_in_progress), style = sideStyle(), color = cadence.primary, modifier = Modifier.padding(start = Space.sm))
            } else {
                RightMark(entry, now, task.estimatedMinutes?.takeIf { it > 0 }?.let { durationText(it) })
            }
        }
    }
}

/** Un événement : l'icône d'agenda de l'app, à la couleur du calendrier, posée sur l'axe. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun TimelineEventRow(
    event: EventWithDone,
    entry: TimelineEntry.Item,
    now: Instant,
    zone: ZoneId,
    checkable: Boolean,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onMenu: () -> Unit,
    onSwipeAction: (SwipeAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = rememberCadenceHaptic()
    val swipeConfig = rememberSwipeConfig()
    val surface = MaterialTheme.colorScheme.surface
    val color = readableTintOf(Color(event.calendar.colorArgb), surface, ICON_CONTRAST)
    val title = event.event.title.ifBlank { stringResource(R.string.tasks_event_untitled) }
    val end = entry.end?.atZone(zone)?.format(hourFormat)
    val markLabel = stringResource(if (event.done) R.string.tasks_event_done else R.string.tasks_event_mark_done)
    SwipeActionContainer(
        config = remember(swipeConfig, checkable) { EventActions.swipeConfig(swipeConfig, checkable) },
        closed = event.done,
        onAction = onSwipeAction,
        shape = Radius.Control,
        forEvent = true,
        modifier = modifier,
    ) { swipeSemantics ->
        TimelineScaffold(
            hour = if (event.event.allDay) stringResource(R.string.today_all_day) else entry.start?.atZone(zone)?.format(hourFormat),
            modifier = Modifier
                .background(surface)
                .then(swipeSemantics)
                .combinedClickable(onClick = onOpen, onLongClick = { haptic.longPress(); onMenu() })
                .alpha(if (entry.past) PAST_ALPHA else 1f),
            marker = {
                val touch = if (checkable) {
                    Modifier
                        .size(RowHeight)
                        .toggleable(value = event.done, role = Role.Checkbox, onValueChange = { onToggle() })
                        .semantics { contentDescription = markLabel }
                } else {
                    Modifier.size(RowHeight)
                }
                Box(touch, contentAlignment = Alignment.Center) {
                    Box(Modifier.size(MarkSize + 2.dp).background(surface), contentAlignment = Alignment.Center) {
                        Icon(
                            if (event.done) Icons.Outlined.EventAvailable else Icons.Outlined.CalendarToday,
                            contentDescription = null,
                            tint = color,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            },
        ) {
            TimelineTitle(title, entry, struck = event.done, modifier = Modifier.weight(1f))
            RightMark(entry, now, if (event.event.allDay || end == null) null else "→ $end")
        }
    }
}

/** « 45 min », « 1 h », « 4 h 35 ». */
internal fun durationText(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return when {
        h == 0 -> "$m min"
        m == 0 -> "$h h"
        else -> "$h h ${m.toString().padStart(2, '0')}"
    }
}
