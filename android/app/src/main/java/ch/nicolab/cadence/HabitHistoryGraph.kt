package ch.nicolab.cadence

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/**
 * Le rythme des dernières périodes. Une seule question : la cadence a-t-elle tenu ?
 * Chaque période est une colonne creusée dans laquelle la part accomplie remonte.
 */
@Composable
fun HabitHistoryGraph(history: List<PeriodStat>, accent: Color, modifier: Modifier = Modifier) {
    val palette = cadence
    Column(modifier) {
        Text(stringResource(R.string.history_graph_title), style = MaterialTheme.typography.labelMedium, color = palette.outline)
        Spacer(Modifier.height(Space.md))
        Row(
            Modifier.fillMaxWidth().height(72.dp),
            horizontalArrangement = Arrangement.spacedBy(Space.sm),
            verticalAlignment = Alignment.Bottom,
        ) {
            history.forEach { period ->
                val ratio = if (period.targetMinor <= 0L) 0f else (period.progressMinor.toFloat() / period.targetMinor).coerceIn(0f, 1f)
                val color = when {
                    period.excludedByPause -> palette.outlineVariant
                    else -> accent
                }
                Box(
                    Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(8.dp)).background(palette.containerHigh),
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    if (ratio > 0f || period.excludedByPause) {
                        Box(
                            Modifier.fillMaxWidth()
                                .height((ratio * 72).dp.coerceAtLeast(6.dp))
                                .clip(RoundedCornerShape(8.dp))
                                .background(color),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.sm))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            history.forEach { period ->
                Text(
                    compactLabel(period.label),
                    Modifier.weight(1f).padding(top = 2.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.outline,
                    maxLines = 1,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
    }
}

/** L'étiquette persistée est une date ISO ; la colonne n'a la place que du jour et du mois. */
private fun compactLabel(label: String): String = runCatching {
    val date = java.time.LocalDate.parse(label)
    "${date.dayOfMonth}/${date.monthValue}"
}.getOrDefault(label)
