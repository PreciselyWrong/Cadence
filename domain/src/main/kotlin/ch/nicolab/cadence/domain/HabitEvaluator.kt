package ch.nicolab.cadence.domain

import java.time.LocalDate

data class HabitEvaluation(
    val habit: HabitDefinition,
    val period: PeriodWindow,
    val progressMinor: Long,
    val isPaused: Boolean,
    val requiresAction: Boolean,
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
        val progress = entries
            .asSequence()
            .filter { it.habitId == habit.id && period.includes(it.localDate) }
            .sumOf(HabitEntry::valueMinor)
        val paused = pauses.any { it.includes(date) }
        val planned = date.dayOfWeek in habit.schedule.activeDays
        val requiresAction = habit.active && planned && !paused && progress < habit.goal.targetMinor

        return HabitEvaluation(
            habit = habit,
            period = period,
            progressMinor = progress,
            isPaused = paused,
            requiresAction = requiresAction,
            countsAsFailure = habit.active && planned && !paused && progress < habit.goal.targetMinor,
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
        ).takeIf(HabitEvaluation::requiresAction)
    }
}
