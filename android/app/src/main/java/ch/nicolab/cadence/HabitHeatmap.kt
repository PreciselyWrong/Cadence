package ch.nicolab.cadence

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
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
        Text(stringResource(R.string.stats_heatmap_title), style = MaterialTheme.typography.labelMedium, color = palette.outline)
        Spacer(Modifier.height(Space.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            days.chunked(7).forEach { week ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                    week.forEach { day ->
                        val level = HeatmapLevel.of(day.valueMinor, day.targetMinor, day.paused)
                        val color = when (level) {
                            1 -> accent.copy(alpha = if (palette.isDark) 0.35f else 0.25f)
                            2 -> accent.copy(alpha = if (palette.isDark) 0.55f else 0.50f)
                            3 -> accent.copy(alpha = if (palette.isDark) 0.75f else 0.75f)
                            4 -> accent
                            else -> palette.containerHigh
                        }
                        Box(
                            Modifier.fillMaxWidth().aspectRatio(1f).background(color, RoundedCornerShape(Space.xs)),
                        )
                    }
                }
            }
        }
    }
}
