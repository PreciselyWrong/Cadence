package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.designsystem.components.ICON_CONTRAST
import ch.nicolab.cadence.designsystem.components.readableTintOf
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color

import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.localEnd
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.designsystem.components.EventCheck
import ch.nicolab.cadence.designsystem.components.pressable
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.tasks.swipe.EventActions
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.rememberSwipeConfig
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.tasks.R
import java.time.Instant
import java.time.ZoneId

/** Opacité d'un événement fait : il reste lisible mais passe derrière les éléments à faire. */
private const val DONE_ALPHA = 0.55f

/**
 * Événement de l'agenda de l'appareil dans la liste Aujourd'hui. La case est dans la couleur du
 * calendrier et ne marque l'événement fait que dans Cadence ; [checkable] à faux la masque.
 */
@Composable
internal fun EventRow(
    item: EventWithDone,
    zone: ZoneId,
    checkable: Boolean,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onMenu: () -> Unit,
    onSwipeAction: (SwipeAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = rememberCadenceHaptic()
    val interaction = remember { MutableInteractionSource() }
    val swipeConfig = rememberSwipeConfig()
    // Rail, cercle et icône dans la couleur de l'agenda, ajustée pour rester visible (3:1).
    val color = readableTintOf(Color(item.calendar.colorArgb), MaterialTheme.colorScheme.surface, ICON_CONTRAST)
    val title = item.event.title.ifBlank { stringResource(R.string.tasks_event_untitled) }
    val markLabel = stringResource(
        if (item.done) R.string.tasks_event_mark_undone else R.string.tasks_event_mark_done,
    )
    SwipeActionContainer(
        config = remember(swipeConfig, checkable) { EventActions.swipeConfig(swipeConfig, checkable) },
        closed = item.done,
        onAction = onSwipeAction,
        shape = RowShape,
        forEvent = true,
        modifier = modifier,
    ) { swipeSemantics ->
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .pressable(interaction, RowShape)
            .background(MaterialTheme.colorScheme.surface, RowShape)
            .then(swipeSemantics)
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                onClick = onOpen,
                onLongClick = {
                    haptic.longPress()
                    onMenu()
                },
            )
            .alpha(if (item.done) DONE_ALPHA else 1f)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.fillMaxHeight().width(RAIL_WIDTH).background(color))
        Spacer(Modifier.width(8.dp))
        if (checkable) {
            EventCheck(
                checked = item.done,
                color = color,
                onCheckedChange = { onToggle() },
                contentDescription = markLabel,
            )
        } else {
            Spacer(Modifier.size(Size.touch))
        }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                textDecoration = if (item.done) TextDecoration.LineThrough else null,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            EventMeta(item, color, zone)
        }
    }
    }
}

@Composable
private fun EventMeta(item: EventWithDone, color: Color, zone: ZoneId) {
    val time = if (item.event.allDay) {
        stringResource(R.string.tasks_event_all_day)
    } else {
        stringResource(
            R.string.tasks_event_time_range,
            clockText(item.event.localStart(zone), zone),
            clockText(item.event.localEnd(zone), zone),
        )
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            Icons.Outlined.CalendarToday,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = stringResource(R.string.tasks_event_meta, time, item.calendar.displayName),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun clockText(epochMillis: Long, zone: ZoneId): String =
    wireTime(instantTime(Instant.ofEpochMilli(epochMillis), zone))

private val RAIL_WIDTH = 3.dp
private val RowShape = Radius.Control
