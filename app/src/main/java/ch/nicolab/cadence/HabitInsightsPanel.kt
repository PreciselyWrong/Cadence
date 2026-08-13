package ch.nicolab.cadence

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitInsights
import ch.nicolab.cadence.domain.MonthMetrics
import ch.nicolab.cadence.domain.TimeSlot
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.HabitLabels
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import kotlin.math.roundToInt

/**
 * Ce que les saisies disent réellement. Rien ne s'affiche tant que l'échantillon ne
 * porte pas la conclusion : une tendance absente vaut mieux qu'une tendance inventée.
 */
@Composable
fun HabitInsightsPanel(
    insights: HabitInsights,
    goal: HabitGoal,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val hasAny = insights.bestDay != null || insights.bestSlot != null || insights.monthComparison != null
    Column(modifier) {
        Text(stringResource(R.string.insights_title), style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
        Spacer(Modifier.height(Space.md))
        if (!hasAny) {
            Text(stringResource(R.string.insights_not_enough), style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
            return@Column
        }
        insights.bestDay?.let { best ->
            InsightLine(
                stringResource(R.string.insights_best_day),
                stringResource(HabitLabels.day(best.day)),
                stringResource(
                    R.string.insights_best_day_detail,
                    HabitFormatter.formatValue(best.averageMinor, goal.goalType, goal.unit),
                    HabitFormatter.formatValue(best.overallAverageMinor, goal.goalType, goal.unit),
                ),
                accent,
            )
        }
        insights.bestSlot?.let { best ->
            InsightLine(
                stringResource(R.string.insights_best_slot),
                stringResource(slotLabel(best.slot)),
                stringResource(R.string.insights_best_slot_detail, (best.share * 100).roundToInt(), best.entryCount),
                accent,
            )
        }
        insights.monthComparison?.let { comparison ->
            Spacer(Modifier.height(Space.md))
            Text(stringResource(R.string.insights_month_title), style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
            Spacer(Modifier.height(Space.sm))
            MonthRow(
                stringResource(R.string.insights_month_quantity),
                HabitFormatter.formatValue(comparison.current.quantityMinor, goal.goalType, goal.unit),
                delta(comparison.current.quantityMinor, comparison.previous.quantityMinor),
                accent,
            )
            MonthRow(
                stringResource(R.string.insights_month_regularity),
                stringResource(R.string.insights_percent, (comparison.current.regularity * 100).roundToInt()),
                delta(
                    (comparison.current.regularity * 100).roundToInt().toLong(),
                    (comparison.previous.regularity * 100).roundToInt().toLong(),
                ),
                accent,
            )
            if (goal.goalType != GoalType.BINARY) {
                comparison.current.minimumDays?.let { current ->
                    MonthRow(
                        stringResource(R.string.insights_month_minimum),
                        stringResource(R.string.insights_days, current),
                        delta(current.toLong(), comparison.previous.minimumDays?.toLong() ?: 0L),
                        accent,
                    )
                }
            }
            comparison.current.idealDays?.let { current ->
                MonthRow(
                    stringResource(R.string.insights_month_ideal),
                    stringResource(R.string.insights_days, current),
                    delta(current.toLong(), comparison.previous.idealDays?.toLong() ?: 0L),
                    accent,
                )
            }
            Spacer(Modifier.height(Space.xs))
            Text(
                stringResource(R.string.insights_month_scope, comparison.current.consideredDays),
                style = MaterialTheme.typography.labelMedium,
                color = palette.inkFaint,
            )
        }
    }
}

@Composable
private fun InsightLine(label: String, value: String, detail: String, accent: Color) {
    val palette = cadence
    Column(Modifier.fillMaxWidth().padding(bottom = Space.md)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
            Text(value, style = MaterialTheme.typography.titleSmall, color = accent)
        }
        Text(detail, style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
    }
}

@Composable
private fun MonthRow(label: String, value: String, delta: MonthDelta, accent: Color) {
    val palette = cadence
    Row(Modifier.fillMaxWidth().padding(vertical = Space.xs), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
        Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            Text(value, style = MaterialTheme.typography.titleSmall, color = palette.ink)
            Text(
                delta.text,
                style = MaterialTheme.typography.titleSmall,
                color = when {
                    delta.value > 0 -> accent
                    delta.value < 0 -> palette.inkMuted
                    else -> palette.inkFaint
                },
            )
        }
    }
}

private data class MonthDelta(val value: Long, val text: String)

private fun delta(current: Long, previous: Long): MonthDelta {
    val difference = current - previous
    val text = when {
        difference > 0 -> "+$difference"
        difference < 0 -> "$difference"
        else -> "="
    }
    return MonthDelta(difference, text)
}

private fun slotLabel(slot: TimeSlot): Int = when (slot) {
    TimeSlot.MORNING -> R.string.insights_slot_morning
    TimeSlot.MIDDAY -> R.string.insights_slot_midday
    TimeSlot.AFTERNOON -> R.string.insights_slot_afternoon
    TimeSlot.EVENING -> R.string.insights_slot_evening
    TimeSlot.NIGHT -> R.string.insights_slot_night
}
