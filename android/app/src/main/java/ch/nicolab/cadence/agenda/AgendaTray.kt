package ch.nicolab.cadence.agenda

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

private val DROP_LABEL: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val GHOST_LIFT = 56.dp
private val GHOST_WIDTH = 200.dp
private val CHIP_MAX_WIDTH = 220.dp

/**
 * État partagé d'un glisser-déposer du bac vers la grille : la grille y publie sa géométrie, le bac
 * y écrit la position du doigt, et [target] en tire l'instant visé avec les fonctions pures de
 * `AgendaDrop`.
 */
@Stable
internal class TrayDragState {
    var item by mutableStateOf<TrayItem?>(null)
    var pointer by mutableStateOf(Offset.Zero)
    var grid: Rect? = null
    var scroll: ScrollState? = null
    var days: List<LocalDate> = emptyList()
    var hourHeightPx: Float = 0f
    var gutterPx: Float = 0f

    /** Instant sous le doigt, ou null quand il est hors de la grille. */
    val target: LocalDateTime?
        get() {
            val rect = grid ?: return null
            if (item == null || hourHeightPx <= 0f) return null
            return dropTarget(
                x = pointer.x,
                y = pointer.y,
                left = rect.left,
                top = rect.top,
                width = rect.width,
                height = rect.height,
                scrollPx = (scroll?.value ?: 0).toFloat(),
                hourHeightPx = hourHeightPx,
                gutterPx = gutterPx,
                days = days,
            )
        }
}

/** Bac « À planifier » : une rangée défilante de pastilles à glisser sur la grille horaire. */
@Composable
internal fun TrayRow(items: List<TrayItem>, drag: TrayDragState, onDrop: (String, LocalDateTime) -> Unit) {
    if (items.isEmpty()) return
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(top = Space.sm)) {
        Text(
            text = stringResource(R.string.agenda_tray_title),
            style = MaterialTheme.typography.labelMedium,
            color = palette.onSurfaceVariant,
            modifier = Modifier.padding(bottom = Space.xs),
        )
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            items.forEach { item -> TrayChip(item = item, drag = drag, onDrop = onDrop) }
        }
    }
}

@Composable
private fun TrayChip(item: TrayItem, drag: TrayDragState, onDrop: (String, LocalDateTime) -> Unit) {
    val palette = cadence
    var origin by remember { mutableStateOf(Offset.Zero) }
    val latestDrop by rememberUpdatedState(onDrop)
    val color = item.colorArgb?.let { Color(it) } ?: palette.primary
    val tint = if (item.overdueDays > 0) palette.error else color
    Row(
        Modifier
            .onGloballyPositioned { origin = it.positionInRoot() }
            .clip(Radius.Chip)
            .background(tint.copy(alpha = Glass.BadgeAlpha))
            .pointerInput(item.uid) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { local ->
                        drag.item = item
                        drag.pointer = origin + local
                    },
                    onDrag = { change, amount ->
                        change.consume()
                        drag.pointer += amount
                    },
                    onDragEnd = {
                        drag.target?.let { latestDrop(item.uid, it) }
                        drag.item = null
                    },
                    onDragCancel = { drag.item = null },
                )
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(Size.rail).height(Size.actionSm).background(tint))
        Text(
            text = item.title.ifBlank { stringResource(R.string.agenda_untitled) },
            style = MaterialTheme.typography.labelLarge,
            color = palette.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = Space.sm).widthIn(max = CHIP_MAX_WIDTH),
        )
        if (item.overdueDays > 0) {
            Text(
                text = if (item.overdueDays == 1) {
                    stringResource(R.string.agenda_tray_yesterday)
                } else {
                    stringResource(R.string.agenda_tray_overdue, item.overdueDays)
                },
                style = MaterialTheme.typography.labelMedium,
                color = palette.error,
                modifier = Modifier.padding(end = Space.sm),
            )
        }
    }
}

/** Pastille qui suit le doigt, avec l'heure visée une fois au-dessus de la grille. */
@Composable
internal fun BoxScope.DragGhost(drag: TrayDragState, origin: Offset) {
    val item = drag.item ?: return
    val palette = cadence
    val lift = with(LocalDensity.current) { GHOST_LIFT.roundToPx() }
    val half = with(LocalDensity.current) { (GHOST_WIDTH / 2).roundToPx() }
    Column(
        Modifier
            .offset { IntOffset((drag.pointer.x - origin.x).roundToInt() - half, (drag.pointer.y - origin.y).roundToInt() - lift) }
            .width(GHOST_WIDTH)
            .clip(Radius.Chip)
            .background(palette.primary)
            .padding(horizontal = Space.md, vertical = Space.sm),
    ) {
        Text(
            text = item.title,
            style = MaterialTheme.typography.labelLarge,
            color = palette.onPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        drag.target?.let { at ->
            Text(
                text = stringResource(R.string.agenda_tray_drop_at, at.format(DROP_LABEL)),
                style = MaterialTheme.typography.labelMedium,
                color = palette.onPrimary,
            )
        }
    }
}
