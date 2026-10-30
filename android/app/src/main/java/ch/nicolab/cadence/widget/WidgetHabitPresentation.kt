package ch.nicolab.cadence.widget

import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.AbstinenceElapsed
import ch.nicolab.cadence.ui.HabitFormatter

internal object WidgetHabitPresentation {
    fun progress(goal: HabitGoal, progressMinor: Long, targetMinor: Long): Float =
        if (goal.isAbstinence || goal.isTracker) 0f
        else (progressMinor.toFloat() / (targetMinor.takeIf { it > 0 } ?: 1L)).coerceIn(0f, 1f)

    fun value(
        goal: HabitGoal,
        progressMinor: Long,
        targetMinor: Long,
        timerSeconds: Long?,
        abstinenceElapsed: AbstinenceElapsed?,
        alcoholSoberDays: Long? = null,
    ): String =
        if (goal.isAbstinence) alcoholSoberDays?.let { "$it j" } ?: abstinenceElapsed?.formatCompact().orEmpty()
        else if (goal.isTracker) timerSeconds?.let { HabitFormatter.formatValue(it, goal.goalType, goal.unit) }
            ?: HabitFormatter.formatWithUnit(progressMinor, goal.goalType, goal.unit)
        else timerSeconds?.let { HabitFormatter.formatValue(it, goal.goalType, goal.unit) }
            ?: HabitFormatter.formatCompactProgress(progressMinor, targetMinor, goal.goalType, goal.unit)
}
