package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

data class HabitEvaluation(
    val habit: HabitDefinition,
    val period: PeriodWindow,
    val progressMinor: Long,
    /** Quantité idéale atteinte. */
    val completedQuantity: Boolean,
    /** Quantité minimale atteinte : c'est elle qui valide la période et la série. */
    val reachedMinimum: Boolean,
    /** Minimum et fréquence atteints : la période compte comme réussie. */
    val validatesPeriod: Boolean,
    val attainment: GoalAttainment,
    /** Cible réellement en vigueur sur la période, progression comprise. */
    val targetMinor: Long,
    /** Position vis-à-vis du maximum, nulle hors habitude à limiter. */
    val limitStatus: LimitStatus?,
    val sessionCount: Int,
    val completedFrequency: Boolean,
    val isCompleted: Boolean,
    val isPaused: Boolean,
    val isPlannedForDate: Boolean,
    val needsAttentionNow: Boolean,
    val requiresAction: Boolean = needsAttentionNow,
    val countsAsFailure: Boolean,
)

/** Un jour où l'habitude est attendue : ni archivée, ni hors planning, ni avant son début. */
fun isPlannedOn(habit: HabitDefinition, date: LocalDate): Boolean =
    habit.active && !habit.archived && date >= habit.startsOn && (habit.goal.isTracker || when (habit.schedule.mode) {
        ScheduleMode.EVERY_DAY -> true
        ScheduleMode.SELECTED_DAYS -> date.dayOfWeek in habit.schedule.activeDays
        ScheduleMode.FLEXIBLE_PERIOD -> true
        ScheduleMode.INTERVAL_DAYS -> ChronoUnit.DAYS.between(habit.startsOn, date) % habit.schedule.intervalDays == 0L
    })

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

        val limit = habit.goal.isLimit
        // La cible du jour tient compte de la progression : elle se recalcule depuis le
        // départ, elle n'est jamais cumulée d'une période à l'autre.
        val target = habit.goal.targetAt(period.start)
        val limitStatus = when {
            !limit -> null
            progress < target -> LimitStatus.UNDER
            progress == target -> LimitStatus.AT_LIMIT
            else -> LimitStatus.EXCEEDED
        }

        val tracker = habit.goal.isTracker
        val completedQuantity = !tracker && progress >= target
        val reachedMinimum = !tracker && progress >= (habit.goal.minimumMinor ?: target)
        val completedFrequency = habit.goal.frequencyTarget == null || sessionCount >= habit.goal.frequencyTarget

        // Sous un plafond, la réussite est de ne pas le dépasser; la fréquence ne s'applique pas.
        val validatesPeriod =
            if (tracker) false else if (limit) limitStatus != LimitStatus.EXCEEDED else reachedMinimum && completedFrequency
        val isCompleted = when {
            tracker -> false
            limit -> validatesPeriod
            else -> completedQuantity && completedFrequency
        }
        val attainment = when {
            limit -> if (validatesPeriod) GoalAttainment.IDEAL else GoalAttainment.TODO
            isCompleted -> GoalAttainment.IDEAL
            validatesPeriod -> GoalAttainment.MINIMUM
            else -> GoalAttainment.TODO
        }

        val paused = pauses.any { it.includes(date) }

        val isPlannedForDate = isPlannedOn(habit, date)

        // Une habitude à limiter reste offerte à la saisie tant qu'il reste de la place :
        // c'est ce qui permet de noter un café, alors qu'il n'y a rien à « accomplir ».
        val needsAttentionNow = !tracker && isPlannedForDate && !paused &&
            if (limit) habit.goal.isAbstinence || limitStatus == LimitStatus.UNDER else !isCompleted

        return HabitEvaluation(
            habit = habit,
            period = period,
            progressMinor = progress,
            completedQuantity = completedQuantity,
            reachedMinimum = reachedMinimum,
            validatesPeriod = validatesPeriod,
            attainment = attainment,
            targetMinor = target,
            limitStatus = limitStatus,
            sessionCount = sessionCount,
            completedFrequency = completedFrequency,
            isCompleted = isCompleted,
            isPaused = paused,
            isPlannedForDate = isPlannedForDate,
            needsAttentionNow = needsAttentionNow,
            requiresAction = needsAttentionNow,
            // Une période où le minimum est atteint n'est pas un échec, même sans l'idéal.
            countsAsFailure = !tracker && isPlannedForDate && !paused && !validatesPeriod,
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
