package ch.nicolab.cadence.bilan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.theme.MetricStyle
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskOverviews
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

/** Moyenne des taux de réussite des habitudes qui ont un recul ; null s'il n'y en a aucune. */
internal fun regularityPercent(rates: List<Int?>): Int? =
    rates.filterNotNull().takeIf { it.isNotEmpty() }?.average()?.roundToInt()

/**
 * Trois chiffres en tête du Bilan : tâches terminées cette semaine, tâches en retard, régularité
 * des habitudes. Le rouge n'apparaît que s'il y a du retard.
 */
@Composable
internal fun TaskKpiPanel(habits: List<HabitCardState>) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.repository(context) }
    val tasks by repository.observeTasks().collectAsStateWithLifecycle(initialValue = emptyList())
    val stats = remember(tasks) {
        val zone = ZoneId.systemDefault()
        TaskOverviews.taskStats(tasks, LocalDate.now(zone), Instant.now(), zone)
    }
    val regularity = remember(habits) {
        regularityPercent(habits.filterNot { it.stored.archived || it.stored.goal.isTracker }.map { it.statistics?.successRatePercent })
    }
    val palette = cadence
    Panel {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.lg)) {
            Kpi(
                value = stats.doneThisWeek.toString(),
                label = stringResource(R.string.bilan_kpi_done),
                hint = stringResource(R.string.bilan_kpi_done_last, stats.doneLastWeek),
                modifier = Modifier.weight(1f),
            )
            Kpi(
                value = stats.overdue.toString(),
                label = stringResource(R.string.bilan_kpi_overdue),
                valueColor = if (stats.overdue > 0) palette.error else palette.onSurface,
                modifier = Modifier.weight(1f),
            )
            Kpi(
                value = regularity?.let { stringResource(R.string.habit_stats_rate_value, it) } ?: "—",
                label = stringResource(R.string.bilan_kpi_regularity),
                hint = stringResource(R.string.bilan_kpi_regularity_hint),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun Kpi(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    valueColor: androidx.compose.ui.graphics.Color = cadence.onSurface,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(value, style = MetricStyle, color = valueColor, maxLines = 1)
        Text(label, style = MaterialTheme.typography.labelLarge, color = cadence.onSurface)
        hint?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}
