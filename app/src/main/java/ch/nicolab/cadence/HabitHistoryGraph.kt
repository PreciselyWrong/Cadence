package ch.nicolab.cadence

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun HabitHistoryGraph(history: List<PeriodStat>, accent: Color, modifier: Modifier = Modifier) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Rythme", style = MaterialTheme.typography.labelLarge)
            Text("6 dernières périodes", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(
            Modifier.fillMaxWidth().height(92.dp).padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            history.forEach { period ->
                val ratio = if (period.targetMinor <= 0L) 0f else (period.progressMinor.toFloat() / period.targetMinor).coerceIn(0f, 1f)
                val color = when { period.excludedByPause -> MaterialTheme.colorScheme.outline; period.succeeded -> accent; else -> accent.copy(alpha = .38f) }
                Box(
                    Modifier.weight(1f)
                        .height((10 + ratio * 70).dp)
                        .background(color, RoundedCornerShape(14.dp)),
                )
            }
        }
    }
}
