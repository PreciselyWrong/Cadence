package ch.nicolab.cadence.bilan

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskOverviews
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private const val PROJECT_LIMIT = 5
private const val OVERDUE_LIMIT = 5

/**
 * Revue des tâches de la semaine : terminées par jour, par projet, et les plus anciennes en retard.
 * Toucher une tâche en retard l'ouvre dans Tâches.
 */
@Composable
internal fun TaskReviewPanel(onOpenTask: (String) -> Unit) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.repository(context) }
    val tasks by repository.observeTasks().collectAsStateWithLifecycle(initialValue = emptyList())
    val projects by repository.observeProjects().collectAsStateWithLifecycle(initialValue = emptyList())
    val zone = remember { ZoneId.systemDefault() }
    val today = LocalDate.now(zone)
    val review = remember(tasks, today) { TaskOverviews.weekReview(tasks, today, Instant.now(), zone) }
    val names = remember(projects) { projects.associate { it.uid to it.name } }
    val palette = cadence

    Panel {
        Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Text(stringResource(R.string.bilan_tasks_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
            Caption(stringResource(R.string.bilan_tasks_per_day))
            DayBars(review.donePerDay, today)
            if (review.doneByProject.isEmpty()) {
                Text(stringResource(R.string.bilan_tasks_none), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            } else {
                Caption(stringResource(R.string.bilan_tasks_by_project))
                review.doneByProject.take(PROJECT_LIMIT).forEach { (uid, count) ->
                    LineWithCount(
                        label = uid?.let(names::get) ?: stringResource(R.string.bilan_tasks_no_project),
                        count = count.toString(),
                    )
                }
            }
            if (review.overdue.isNotEmpty()) {
                Caption(stringResource(R.string.bilan_tasks_overdue), color = palette.error)
                review.overdue.take(OVERDUE_LIMIT).forEach { task ->
                    LineWithCount(
                        label = task.name,
                        count = task.dueDay?.let(::shortDate).orEmpty(),
                        onClick = { onOpenTask(task.uid) },
                    )
                }
                val more = review.overdue.size - OVERDUE_LIMIT
                if (more > 0) {
                    Text(
                        pluralStringResource(R.plurals.bilan_tasks_overdue_more, more, more),
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Sept barres, lundi à dimanche, à l'échelle du meilleur jour ; aujourd'hui en primaire plein. */
@Composable
private fun DayBars(days: List<Pair<LocalDate, Int>>, today: LocalDate) {
    val palette = cadence
    val max = days.maxOf { it.second }.coerceAtLeast(1)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        days.forEach { (day, count) ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(count.toString(), style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
                Box(Modifier.fillMaxWidth().height(Size.statisticsPulse), contentAlignment = Alignment.BottomCenter) {
                    if (count > 0) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .fillMaxHeight(count.toFloat() / max)
                                .clip(Radius.Control)
                                .background(if (day == today) palette.primary else palette.primary.copy(alpha = MUTED_ALPHA)),
                        )
                    }
                }
                Text(
                    day.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.FRENCH),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (day == today) palette.onSurface else palette.onSurfaceVariant,
                    modifier = Modifier.padding(top = Space.xs),
                )
            }
        }
    }
}

@Composable
private fun Caption(text: String, color: androidx.compose.ui.graphics.Color = cadence.onSurfaceVariant) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = color)
}

@Composable
private fun LineWithCount(label: String, count: String, onClick: (() -> Unit)? = null) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = if (onClick != null) Size.touch else Size.iconLarge)
            .then(if (onClick != null) Modifier.clip(Radius.Control).clickable(onClick = onClick) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        Text(
            label,
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(count, style = MaterialTheme.typography.labelLarge, color = palette.onSurfaceVariant)
    }
}

private fun shortDate(date: LocalDate): String = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH).format(date)

private const val MUTED_ALPHA = 0.45f
