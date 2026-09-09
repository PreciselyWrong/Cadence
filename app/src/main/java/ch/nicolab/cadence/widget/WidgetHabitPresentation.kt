package ch.nicolab.cadence.widget

import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.AbstinenceElapsed
import ch.nicolab.cadence.ui.HabitFormatter

internal object WidgetHabitPresentation {
    fun progress(goal: HabitGoal, progressMinor: Long, targetMinor: Long): Float =
        if (goal.isAbstinence) 0f
        else (progressMinor.toFloat() / (targetMinor.takeIf { it > 0 } ?: 1L)).coerceIn(0f, 1f)

    fun value(goal: HabitGoal, progressMinor: Long, targetMinor: Long, timerSeconds: Long?, abstinenceElapsed: AbstinenceElapsed?): String =
        if (goal.isAbstinence) abstinenceElapsed?.formatCompact().orEmpty()
        else timerSeconds?.let { HabitFormatter.formatValue(it, goal.goalType, goal.unit) }
            ?: HabitFormatter.formatCompactProgress(progressMinor, targetMinor, goal.goalType, goal.unit)
}
