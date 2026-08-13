package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

data class HabitEvaluation(
    val habit: HabitDefinition,
    val period: PeriodWindow,
    val progressMinor: Long,
    val completedQuantity: Boolean,
    val sessionCount: Int,
    val completedFrequency: Boolean,
    val isCompleted: Boolean,
    val isPaused: Boolean,
    val isPlannedForDate: Boolean,
    val needsAttentionNow: Boolean,
    val requiresAction: Boolean = needsAttentionNow,
    val countsAsFailure: Boolean,
)

class HabitEvaluator {
    fun evaluate(
        habit: HabitDefinition,
        date: LocalDate,
        entries: List<HabitEntry>,
        pauses: List<HabitPause> = emptyList(),
    ): HabitEvaluation {
        val period = PeriodCalculator.window(date, habit.goal.period, habit.schedule.firstDayOfWeek)
        val periodEntries = entries.filter { it.habitId == habit.id && period.includes(it.localDate) }
        val progress = periodEntries.sumOf { it.valueMinor }

        val withSession = periodEntries.mapNotNull { it.sessionId }.distinct().size
        val withoutSession = periodEntries.count { it.sessionId == null }
        val sessionCount = withSession + withoutSession

        val completedQuantity = progress >= habit.goal.targetMinor
        val completedFrequency = habit.goal.frequencyTarget == null || sessionCount >= habit.goal.frequencyTarget
        val isCompleted = completedQuantity && completedFrequency

        val paused = pauses.any { it.includes(date) }

        val isPlannedForDate = habit.active && !habit.archived && date >= habit.startsOn && when (habit.schedule.mode) {
            ScheduleMode.EVERY_DAY -> true
            ScheduleMode.SELECTED_DAYS -> date.dayOfWeek in habit.schedule.activeDays
            ScheduleMode.FLEXIBLE_PERIOD -> true
            ScheduleMode.INTERVAL_DAYS -> ChronoUnit.DAYS.between(habit.startsOn, date) % habit.schedule.intervalDays == 0L
        }

        val needsAttentionNow = isPlannedForDate && !paused && !isCompleted

        return HabitEvaluation(
            habit = habit,
            period = period,
            progressMinor = progress,
            completedQuantity = completedQuantity,
            sessionCount = sessionCount,
            completedFrequency = completedFrequency,
            isCompleted = isCompleted,
            isPaused = paused,
            isPlannedForDate = isPlannedForDate,
            needsAttentionNow = needsAttentionNow,
            requiresAction = needsAttentionNow,
            countsAsFailure = isPlannedForDate && !paused && !isCompleted,
        )
    }
}
class PendingHabitsResolver(
    private val evaluator: HabitEvaluator,
) {
    fun resolve(
        habits: List<HabitDefinition>,
        date: LocalDate,
        entries: List<HabitEntry>,
        pauses: Map<String, List<HabitPause>> = emptyMap(),
    ): List<HabitEvaluation> = habits.mapNotNull { habit ->
        evaluator.evaluate(
            habit = habit,
            date = date,
            entries = entries,
            pauses = pauses[habit.id].orEmpty(),
        ).takeIf(HabitEvaluation::needsAttentionNow)
    }
}
