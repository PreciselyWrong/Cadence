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
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.components.pressable
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.swipe.FileBackedActions
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.SwipeConfig
import ch.nicolab.cadence.tasks.swipe.rememberSwipeConfig
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.delay

private val RowShape = Radius.Control
private val RailWidth = 3.dp
private const val VIRTUAL_ALPHA = 0.6f

/** Temps pendant lequel la ligne reste cochée et barrée avant de quitter la liste. */
private const val COMPLETION_HOLD_MILLIS = 1_500L

/**
 * Une tâche dans une liste. Glisser à droite ou à gauche déclenche les actions réglées dans
 * Réglages › Gestes ; toucher ouvre la fiche, appuyer longtemps ouvre le menu d'actions.
 * La largeur du liseré de projet est toujours réservée pour aligner cases et titres.
 */
@Composable
internal fun TaskRow(
    task: TaskItem,
    projectName: String?,
    projectColor: Int? = null,
    projectIcon: String? = null,
    today: LocalDate,
    zone: ZoneId,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onSwipeAction: (SwipeAction) -> Unit,
    onMenu: () -> Unit,
    modifier: Modifier = Modifier,
    sectionDay: LocalDate? = null,
) {
    val haptic = rememberCadenceHaptic()
    val interaction = remember { MutableInteractionSource() }
    // Coche et barré apparaissent tout de suite ; la tâche quitte la liste après le délai du modèle.
    var completing by remember { mutableStateOf(false) }
    LaunchedEffect(completing) {
        if (completing) {
            delay(COMPLETION_HOLD_MILLIS)
            completing = false
        }
    }
    val showClosed = task.isClosed || completing

    val swipeConfig = rememberSwipeConfig()
    SwipeActionContainer(
        config = remember(task.fileBacked, task.virtual, swipeConfig) {
            if (task.virtual) SwipeConfig(SwipeAction.NONE, SwipeAction.NONE, SwipeAction.NONE, SwipeAction.NONE)
            else FileBackedActions.swipeConfig(task, swipeConfig)
        },
        closed = task.isClosed,
        onAction = onSwipeAction,
        shape = RowShape,
        modifier = modifier,
    ) { swipeSemantics ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .pressable(interaction, RowShape)
                .background(MaterialTheme.colorScheme.surface, RowShape)
                .then(swipeSemantics)
                .alpha(if (task.virtual) VIRTUAL_ALPHA else 1f)
                .combinedClickable(
                    interactionSource = interaction,
                    indication = null,
                    onClick = onOpen,
                    // Une occurrence à venir n'a pas d'actions propres : le menu agirait sur la tâche enregistrée.
                    onLongClick = {
                        haptic.longPress()
                        if (task.virtual) onOpen() else onMenu()
                    },
                )
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .padding(start = 4.dp)
                    .width(RailWidth)
                    .height(32.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(projectColor?.let { Color(it) } ?: Color.Transparent),
            )
            TaskCheckbox(
                checked = showClosed,
                onCheckedChange = {
                    // Seule l'occurrence enregistrée se coche : ouvrir la fiche vaut mieux qu'un geste sans effet.
                    if (task.virtual) {
                        onOpen()
                    } else {
                        if (!task.isClosed) completing = true
                        onToggle()
                    }
                },
                highPriority = task.priority == TaskPriority.HIGH,
                contentDescription = stringResource(if (task.isClosed) R.string.tasks_mark_undone else R.string.tasks_mark_done),
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                Text(
                    text = task.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (showClosed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    textDecoration = if (showClosed) TextDecoration.LineThrough else null,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                TaskMeta(task, projectName, projectIcon, today, zone, sectionDay)
            }
            // Une priorité haute est déjà portée par le trait rouge de la case.
            task.priority?.takeIf { it != TaskPriority.HIGH }?.let { priority ->
                Box(
                    Modifier
                        .padding(start = 8.dp)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(priorityColor(priority)),
                )
            }
            Spacer(Modifier.width(16.dp))
        }
    }
}

/**
 * Faux quand la section affiche déjà le jour de l'échéance : la pastille ne répète pas la date.
 * Une tâche en retard garde sa date, son badge rouge étant le signal.
 */
internal fun showsDueDay(dueDay: LocalDate, sectionDay: LocalDate?, overdue: Boolean): Boolean =
    overdue || sectionDay != dueDay

@Composable
private fun TaskMeta(task: TaskItem, projectName: String?, projectIcon: String?, today: LocalDate, zone: ZoneId, sectionDay: LocalDate?) {
    val pendingText = stringResource(R.string.tasks_pending_sync)
    val recurringText = stringResource(R.string.tasks_recurring)
    val dueDate = task.dueDay
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dueDate != null) {
            val overdue = TaskViews.isOverdue(task, today)
            val day = if (showsDueDay(dueDate, sectionDay, overdue)) dayLabel(dueDate, today) else null
            val time = task.dueDate?.takeIf { task.dueHasTime }?.let { wireTime(instantTime(it, zone)) }
            val badge = listOfNotNull(day, time).joinToString(" ")
            if (badge.isNotEmpty()) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (overdue) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (overdue) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        if (task.fileBacked) {
            val fileText = stringResource(R.string.tasks_file_badge)
            val fileDescription = stringResource(R.string.tasks_file_badge_description)
            Text(
                text = fileText,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
                    .semantics { contentDescription = fileDescription },
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
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.weight(1f, fill = false),
            ) {
                // Sans icône choisie, le nom reste seul : pas de pastille de remplacement.
                entityIcon(projectIcon)?.let { EntityIcon(it, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 14.dp) }
                Text(
                    text = projectName,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
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
