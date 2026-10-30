package ch.nicolab.cadence.tasks.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** L'application est en français : dates et heures suivent cette langue, quelle que soit celle de l'appareil. */
internal val tasksLocale: Locale = Locale.FRENCH

private val MediumPriorityColor = Color(0xFFF57C00)
private val LowPriorityColor = Color(0xFF1976D2)

/** Heure sur 24 h, « 15:45 » : même forme à l'écran et dans les échanges avec le serveur. */
internal fun wireTime(time: LocalTime): String = time.format(DateTimeFormatter.ofPattern("HH:mm"))

internal fun instantTime(instant: Instant, zone: ZoneId): LocalTime = instant.atZone(zone).toLocalTime()

@Composable
internal fun priorityColor(priority: Int): Color = when (priority) {
    TaskPriority.HIGH -> MaterialTheme.colorScheme.error
    TaskPriority.MEDIUM -> MediumPriorityColor
    else -> LowPriorityColor
}

internal fun statusLabelRes(status: Int): Int = when (status) {
    TaskStatus.IN_PROGRESS -> R.string.tasks_status_in_progress
    TaskStatus.PLANNED -> R.string.tasks_status_planned
    TaskStatus.WAITING -> R.string.tasks_status_waiting
    else -> R.string.tasks_status_todo
}
