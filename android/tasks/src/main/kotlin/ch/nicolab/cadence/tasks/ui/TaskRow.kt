package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.rememberSwipeConfig
import java.time.LocalDate
import java.time.ZoneId

/**
 * Une tâche dans une liste. Glisser à droite ou à gauche déclenche les actions réglées dans
 * Réglages › Gestes ; toucher ou appuyer longtemps ouvre la fiche.
 */
@Composable
internal fun TaskRow(
    task: TaskItem,
    projectName: String?,
    projectColor: Int? = null,
    today: LocalDate,
    zone: ZoneId,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onSwipeAction: (SwipeAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    SwipeActionContainer(
        config = rememberSwipeConfig(),
        closed = task.isClosed,
        onAction = onSwipeAction,
        modifier = modifier,
    ) { swipeSemantics ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .then(swipeSemantics)
                .combinedClickable(onClick = onOpen, onLongClick = onOpen)
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (projectColor != null) {
                Box(
                    Modifier
                        .padding(start = 4.dp)
                        .width(3.dp)
                        .height(32.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(projectColor)),
                )
            }
            TaskCheckbox(
                checked = task.status == TaskStatus.DONE,
                onCheckedChange = { onToggle() },
                highPriority = task.priority == TaskPriority.HIGH,
                contentDescription = stringResource(if (task.isClosed) R.string.tasks_mark_undone else R.string.tasks_mark_done),
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                Text(
                    text = task.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (task.isClosed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    textDecoration = if (task.isClosed) TextDecoration.LineThrough else null,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                TaskMeta(task, projectName, today, zone)
            }
            task.priority?.let { priority ->
                Box(
                    Modifier
                        .padding(start = 8.dp, end = 16.dp)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(priorityColor(priority)),
                )
            }
        }
    }
}

@Composable
private fun TaskMeta(task: TaskItem, projectName: String?, today: LocalDate, zone: ZoneId) {
    val pendingText = stringResource(R.string.tasks_pending_sync)
    val recurringText = stringResource(R.string.tasks_recurring)
    val dueDate = task.dueDay
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dueDate != null) {
            val overdue = dueDate.isBefore(today) && !task.isClosed
            val time = task.dueDate?.takeIf { task.dueHasTime }
                ?.let { " " + wireTime(instantTime(it, zone)) }
                .orEmpty()
            Text(
                text = dayLabel(dueDate, today) + time,
                style = MaterialTheme.typography.labelSmall,
                color = if (overdue) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (overdue) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        if (task.isRecurring) {
            Icon(
                Icons.Outlined.Repeat,
                contentDescription = recurringText,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp),
            )
        }
        if (projectName != null) {
            Text(
                text = projectName,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
        }
        if (task.pendingSync) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary)
                    .semantics { contentDescription = pendingText },
            )
        }
    }
}
