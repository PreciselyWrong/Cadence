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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.components.readableTintOf
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
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

private val HourWidth = 44.dp
private val AxisWidth = 44.dp
private val TimelineRowHeight = 44.dp
private const val PAST_ALPHA = 0.38f
private val hourFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("H:mm")

/** Titre de section discret : « À CASER », « MA JOURNÉE », et un complément à droite. */
@Composable
internal fun TimelineSectionTitle(text: String, trailing: String? = null) {
    Row(Modifier.fillMaxWidth().padding(top = Space.md, bottom = Space.xs), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text.uppercase(),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
            color = cadence.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        trailing?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = cadence.onSurfaceVariant) }
    }
}

/** Squelette d'une ligne : heure, axe (trait vertical et repère), contenu. */
@Composable
private fun TimelineScaffold(
    hour: String?,
    modifier: Modifier = Modifier,
    hourColor: Color = cadence.onSurfaceVariant,
    axis: Boolean = true,
    marker: @Composable () -> Unit = {},
    content: @Composable RowScope.() -> Unit,
) {
    val line = cadence.outlineVariant
    // L'axe se trace sur toute la hauteur de la ligne, au milieu de sa colonne : il se raccorde à la ligne suivante.
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = TimelineRowHeight)
            .drawBehind {
                if (axis) {
                    val x = (HourWidth + AxisWidth / 2).toPx()
                    drawLine(line, Offset(x, 0f), Offset(x, size.height), strokeWidth = 2.dp.toPx())
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            hour.orEmpty(),
            style = MaterialTheme.typography.labelMedium,
            color = hourColor,
            textAlign = TextAlign.End,
            maxLines = 1,
            modifier = Modifier.width(HourWidth),
        )
        Box(Modifier.width(AxisWidth), contentAlignment = Alignment.Center        ) { marker() }
        content()
    }
}

/** Le trait « maintenant » : l'heure en rouge et une ligne qui traverse. */
@Composable
internal fun TimelineNowRow(now: Instant, zone: ZoneId) {
    val red = cadence.error
    TimelineScaffold(
        hour = now.atZone(zone).format(hourFormat),
        hourColor = red,
        marker = {
            // Le trait part du point, au milieu de l'axe, et traverse la ligne.
            Box(Modifier.size(AxisWidth, 10.dp).drawBehind {
                drawLine(red, Offset(size.width / 2, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = 2.dp.toPx())
            })
            Box(Modifier.size(10.dp).clip(CircleShape).background(red))
        },
        modifier = Modifier.heightIn(max = 24.dp),
    ) {
        Box(Modifier.weight(1f).height(2.dp).background(red))
    }
}

/** Temps libre devant soi : « 4 h 35 libres », et « Caser les N ici » s'il reste des tâches à caser. */
@Composable
internal fun TimelineFreeRow(free: TimelineEntry.Free, placeCount: Int, onPlace: () -> Unit) {
    TimelineScaffold(hour = null) {
        Text(
            stringResource(R.string.today_free_time, durationText(free.minutes)),
            style = MaterialTheme.typography.bodySmall,
            color = cadence.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        if (placeCount > 0) {
            Box(
                Modifier
                    .heightIn(min = Size.touch)
                    .clickable(role = Role.Button, onClick = onPlace),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    pluralStringResourceSafe(R.plurals.today_place_here, placeCount),
                    style = MaterialTheme.typography.labelLarge,
                    color = cadence.primary,
                    modifier = Modifier
                        .clip(Radius.Pill)
                        .border(1.dp, cadence.primary.copy(alpha = 0.5f), Radius.Pill)
                        .padding(horizontal = Space.md, vertical = Space.xs),
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
            style = MaterialTheme.typography.labelMedium,
            color = if (entry.next) cadence.primary else cadence.onSurfaceVariant,
            fontWeight = if (entry.next) FontWeight.SemiBold else null,
            maxLines = 1,
            modifier = Modifier.padding(start = Space.sm),
        )
    }
}

/** Titre de l'élément, en gras pour la prochaine chose, suivi de « en même temps » s'il chevauche. */
@Composable
private fun TimelineTitle(title: String, entry: TimelineEntry.Item, struck: Boolean, modifier: Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(
            title,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (entry.next) FontWeight.Bold else null,
            textDecoration = if (struck) androidx.compose.ui.text.style.TextDecoration.LineThrough else null,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (entry.overlaps) {
            Text(
                " · " + stringResource(R.string.today_overlap),
                style = MaterialTheme.typography.labelSmall,
                color = cadence.warning,
                maxLines = 1,
            )
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
    val minutes = task.estimatedMinutes?.takeIf { it > 0 }
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
                Box(contentAlignment = Alignment.Center) {
                    // Masque l'axe sous le cercle visible seulement (24 dp), pas sous toute la zone tactile.
                    Box(Modifier.size(26.dp).background(MaterialTheme.colorScheme.surface, CircleShape))
                    TaskCheckbox(
                        checked = checking || task.isClosed,
                        onCheckedChange = {
                            checking = !checking
                            onToggle()
                        },
                        highPriority = task.priority == TaskPriority.HIGH,
                        contentDescription = stringResource(R.string.tasks_mark_done),
                    )
                }
            },
        ) {
            TimelineTitle(task.name, entry, struck = checking || task.isClosed, modifier = Modifier.weight(1f))
            RightMark(entry, now, minutes?.let { durationText(it) })
        }
    }
}

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
    val color = readableTintOf(Color(event.calendar.colorArgb), MaterialTheme.colorScheme.surface, ICON_CONTRAST)
    val title = event.event.title.ifBlank { stringResource(R.string.tasks_event_untitled) }
    val end = entry.end?.atZone(zone)?.format(hourFormat)
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
                .background(MaterialTheme.colorScheme.surface)
                .then(swipeSemantics)
                .combinedClickable(onClick = onOpen, onLongClick = { haptic.longPress(); onMenu() })
                .alpha(if (entry.past) PAST_ALPHA else 1f),
            marker = {
                val dot = Modifier
                    .size(if (checkable) Size.touch else 12.dp)
                    .then(if (checkable) Modifier.clickable(role = Role.Checkbox, onClick = onToggle) else Modifier)
                Box(dot, contentAlignment = Alignment.Center) {
                    Box(
                        Modifier
                            .size(12.dp)
                            .background(MaterialTheme.colorScheme.surface, CircleShape)
                            .padding(1.dp)
                            .clip(CircleShape)
                            .background(color),
                    )
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

@Composable
private fun pluralStringResourceSafe(id: Int, count: Int): String =
    androidx.compose.ui.res.pluralStringResource(id, count, count)
