package ch.nicolab.cadence

import ch.nicolab.cadence.designsystem.components.tintedSurface
import ch.nicolab.cadence.designsystem.components.readableTintOf
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.HabitFacet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.habitAccent
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import java.time.Instant

sealed interface ToCompleteItem {
    val key: String
    val habit: HabitCardState

    data class AlcoholQuantity(
        override val habit: HabitCardState,
        val consumption: AlcoholConsumption,
    ) : ToCompleteItem {
        override val key: String get() = "alcohol_quantity_${consumption.id}"
    }

    data class ActiveTimer(
        override val habit: HabitCardState,
        val timer: HabitTimer,
    ) : ToCompleteItem {
        override val key: String get() = "active_timer_${timer.habitId}"
    }

    companion object {
        fun resolve(
            habits: List<HabitCardState>,
            timers: Map<String, HabitTimer>,
        ): List<ToCompleteItem> {
            val result = mutableListOf<ToCompleteItem>()

            for (habit in habits) {
                if (habit.stored.archived) continue
                val unknownConsumptions = habit.alcoholConsumptions.filter { it.standardDrinks == null }
                for (consumption in unknownConsumptions) {
                    result += AlcoholQuantity(habit, consumption)
                }
            }

            for (habit in habits) {
                if (habit.stored.archived) continue
                val timer = timers[habit.stored.id]
                if (timer != null && (timer.isRunning || timer.accumulatedSeconds > 0)) {
                    result += ActiveTimer(habit, timer)
                }
            }

            return result
        }
    }
}

@Composable
fun ToCompleteRow(
    item: ToCompleteItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = cadence
    val tint = palette.habitAccent(item.habit.stored.colorArgb)
    val title = item.habit.stored.name
    val (subtitle, actionText, icon) = when (item) {
        is ToCompleteItem.AlcoholQuantity -> {
            val date = displayAbstinenceDate(item.consumption.localDate)
            Triple(
                stringResource(R.string.today_to_complete_alcohol_unknown, date),
                stringResource(R.string.today_to_complete_alcohol_action),
                HabitIconRegistry.getIcon(item.habit.stored.iconId).imageVector,
            )
        }
        is ToCompleteItem.ActiveTimer -> {
            val elapsed = if (item.timer.isRunning) {
                item.timer.elapsedSecondsAt(Instant.now())
            } else {
                item.timer.accumulatedSeconds
            }
            val formattedTime = HabitFormatter.formatValue(elapsed, GoalType.DURATION, item.habit.stored.goal.unit)
            val desc = if (item.timer.isRunning) {
                stringResource(R.string.today_to_complete_timer_running, formattedTime)
            } else {
                stringResource(R.string.today_to_complete_timer_paused, formattedTime)
            }
            Triple(
                desc,
                stringResource(R.string.today_to_complete_timer_action),
                Icons.Outlined.Timer,
            )
        }
    }

    Panel(
        onClick = onClick,
        modifier = modifier
            .testTag("to_complete_row_${item.key}")
            .semantics { contentDescription = "$title : $actionText" },
    ) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HabitFacet(
                icon = icon,
                label = null,
                progress = 0f,
                tint = tint,
                trackColor = tint.copy(alpha = 0.20f),
                size = Size.badge,
            )
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(Space.sm))
            Box(
                Modifier
                    .clip(Radius.Chip)
                    .background(tint.copy(alpha = if (palette.isDark) 0.22f else 0.10f))
                    .heightIn(min = Size.touch)
                    .padding(horizontal = Space.md),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = actionText,
                    style = MaterialTheme.typography.labelLarge,
                    color = readableTintOf(tint, tintedSurface(tint, if (palette.isDark) 0.22f else 0.10f, palette.card)),
                )
            }
        }
    }
}
