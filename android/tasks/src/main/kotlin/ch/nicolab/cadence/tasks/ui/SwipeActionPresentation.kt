package ch.nicolab.cadence.tasks.ui

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material.icons.outlined.Today
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.swipe.SwipeAction

/** Libellé d'une action ; « Terminer » devient « Rouvrir » sur une tâche déjà fermée. */
@StringRes
internal fun swipeActionLabelRes(action: SwipeAction, closed: Boolean = false): Int = when (action) {
    SwipeAction.COMPLETE -> if (closed) R.string.swipe_action_reopen else R.string.swipe_action_complete
    SwipeAction.SCHEDULE -> R.string.swipe_action_schedule
    SwipeAction.TODAY -> R.string.swipe_action_today
    SwipeAction.TOMORROW -> R.string.swipe_action_tomorrow
    SwipeAction.NEXT_WEEK -> R.string.swipe_action_next_week
    SwipeAction.MOVE_PROJECT -> R.string.swipe_action_move_project
    SwipeAction.PRIORITY -> R.string.swipe_action_priority
    SwipeAction.DELETE -> R.string.swipe_action_delete
    SwipeAction.NONE -> R.string.swipe_action_none
}

internal fun swipeActionIcon(action: SwipeAction, closed: Boolean = false): ImageVector = when (action) {
    SwipeAction.COMPLETE -> if (closed) Icons.Outlined.Replay else Icons.Outlined.Check
    SwipeAction.SCHEDULE -> Icons.Outlined.CalendarMonth
    SwipeAction.TODAY -> Icons.Outlined.Today
    SwipeAction.TOMORROW -> Icons.Outlined.Event
    SwipeAction.NEXT_WEEK -> Icons.Outlined.EventRepeat
    SwipeAction.MOVE_PROJECT -> Icons.Outlined.Folder
    SwipeAction.PRIORITY -> Icons.Outlined.Flag
    SwipeAction.DELETE -> Icons.Outlined.Delete
    SwipeAction.NONE -> Icons.Outlined.Block
}

/** Fond et encre d'une action une fois son seuil franchi. */
@Composable
internal fun swipeActionColors(action: SwipeAction): Pair<Color, Color> {
    val palette = cadence
    return when (action) {
        SwipeAction.COMPLETE -> palette.success to palette.background
        SwipeAction.DELETE -> palette.error to palette.onError
        SwipeAction.PRIORITY -> palette.warning to palette.background
        SwipeAction.MOVE_PROJECT -> palette.onSurfaceVariant to palette.background
        SwipeAction.NONE -> palette.containerHigh to palette.onSurfaceVariant
        else -> palette.primary to palette.onPrimary
    }
}
