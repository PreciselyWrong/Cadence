package ch.nicolab.cadence

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.ui.theme.Size
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence
import java.time.LocalDate

data class DailyStat(val date: LocalDate, val valueMinor: Long, val targetMinor: Long, val paused: Boolean)

object HeatmapLevel {
    fun of(valueMinor: Long, targetMinor: Long, paused: Boolean): Int {
        if (paused || valueMinor <= 0L) return 0
        if (targetMinor <= 0L) return 1
        val ratio = valueMinor.toDouble() / targetMinor
        return when {
            ratio >= 1.0 -> 4
            ratio >= .66 -> 3
            ratio >= .33 -> 2
            else -> 1
        }
    }
}

@Composable
fun HabitHeatmap(days: List<DailyStat>, accent: Color, modifier: Modifier = Modifier) {
    val palette = cadence
    Column(modifier) {
        Text(stringResource(R.string.stats_heatmap_title), style = MaterialTheme.typography.labelMedium, color = palette.inkFaint)
        Spacer(Modifier.height(Space.md))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            days.chunked(7).forEach { week ->
                Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                    week.forEach { day ->
                        val level = HeatmapLevel.of(day.valueMinor, day.targetMinor, day.paused)
                        val color = if (level == 0) palette.sunken else accent.copy(alpha = .2f * level)
                        androidx.compose.foundation.layout.Box(
                            Modifier.size(Size.heatmapCell).background(color, RoundedCornerShape(Space.xs)),
                        )
                    }
                }
            }
        }
    }
}
