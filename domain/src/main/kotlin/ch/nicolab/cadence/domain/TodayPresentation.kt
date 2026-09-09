package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit

data class TodaySections(
    val now: List<HabitEvaluation>,
    val later: List<HabitEvaluation>,
    val earlier: List<HabitEvaluation>,
    val completed: List<HabitEvaluation>,
)

object TodayPresentation {
    fun directAmount(evaluation: HabitEvaluation, quickValues: List<Long>): Long? {
        val goal = evaluation.habit.goal
        if (!available(evaluation) || !evaluation.needsAttentionNow || goal.isAbstinence || (!goal.isLimit && evaluation.isCompleted)) return null
        val remaining = (evaluation.targetMinor - evaluation.progressMinor).coerceAtLeast(0)
        if (goal.isLimit && remaining == 0L) return null
        if (goal.goalType == GoalType.BINARY) return remaining.takeIf { it > 0 } ?: evaluation.targetMinor.coerceAtLeast(1)
        val amount = quickValues.firstOrNull { it > 0 } ?: goal.unit?.scaleToCanonical ?: 1
        return if (goal.isLimit) minOf(amount, remaining) else amount
    }

    fun sections(evaluations: List<HabitEvaluation>, groups: List<HabitGroup>, time: LocalTime): TodaySections {
        val byId = groups.associateBy(HabitGroup::id)
        val now = mutableListOf<HabitEvaluation>()
        val later = mutableListOf<HabitEvaluation>()
        val earlier = mutableListOf<HabitEvaluation>()
        val completed = mutableListOf<HabitEvaluation>()
        evaluations.filter { available(it) && !it.habit.goal.isAbstinence }.forEach { evaluation ->
            val group = byId[evaluation.habit.groupId]
            when {
                !evaluation.habit.goal.isLimit && evaluation.isCompleted -> completed.add(evaluation)
                group == null || group.isActiveAt(time) -> now.add(evaluation)
                (group.startMinute ?: 0) > time.hour * 60 + time.minute -> later.add(evaluation)
                else -> earlier.add(evaluation)
            }
        }
        return TodaySections(now, later, earlier, completed)
    }

    fun shouldOfferReturn(previousVisit: LocalDate?, latestEntry: LocalDate?, today: LocalDate, hasAvailableHabits: Boolean): Boolean {
        if (previousVisit == null || !hasAvailableHabits) return false
        val lastActivity = maxOf(previousVisit, latestEntry ?: previousVisit)
        return ChronoUnit.DAYS.between(lastActivity, today) >= 7
    }

    private fun available(evaluation: HabitEvaluation): Boolean =
        evaluation.habit.active && !evaluation.habit.archived && evaluation.isPlannedForDate && !evaluation.isPaused
}
