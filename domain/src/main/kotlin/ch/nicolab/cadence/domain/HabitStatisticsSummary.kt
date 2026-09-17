package ch.nicolab.cadence.domain

import java.time.LocalDate
import kotlin.math.roundToInt

enum class HabitStatisticsDayStatus { UNPLANNED, PAUSED, MISSED, MINIMUM, IDEAL, ACTIVITY, NO_ACTIVITY }

enum class StatisticsConfidence {
    INSUFFICIENT,
    LIMITED,
    ESTABLISHED,
}
enum class StatisticsTrend {
    IMPROVING,
    DECLINING,
    STABLE,
}

data class HabitStatisticsComparison(
    val currentRatePercent: Int,
    val previousRatePercent: Int,
    val deltaPercentagePoints: Int,
    val trend: StatisticsTrend,
)

data class HabitStatisticsCompleteness(
    val evaluatedPeriods: Int,
    val observablePeriods: Int,
    val confidence: StatisticsConfidence,
)

data class HabitStatisticsDay(val date: LocalDate, val status: HabitStatisticsDayStatus)

data class HabitStatisticsPeriod(
    val start: LocalDate,
    val endExclusive: LocalDate,
    val periodType: PeriodType,
    val status: HabitStatisticsDayStatus,
)

data class HabitStatisticsSummary(
    val evaluatedPeriods: Int,
    val validatedPeriods: Int,
    val idealPeriods: Int,
    val previousEvaluatedPeriods: Int,
    val previousValidatedPeriods: Int,
    val previousIdealPeriods: Int,
    val periodType: PeriodType?,
    val from: LocalDate,
    val untilExclusive: LocalDate,
    val previousFrom: LocalDate,
    val days: List<HabitStatisticsDay> = emptyList(),
    val periods: List<HabitStatisticsPeriod> = emptyList(),
    val observablePeriods: Int = evaluatedPeriods,
    val previousObservablePeriods: Int = previousEvaluatedPeriods,
    val comparison: HabitStatisticsComparison? = null,
    val isHomogeneous: Boolean = true,
) {
    val completeness: HabitStatisticsCompleteness
        get() = HabitStatisticsCompleteness(
            evaluatedPeriods = evaluatedPeriods,
            observablePeriods = observablePeriods,
            confidence = confidenceFor(periodType, evaluatedPeriods),
        )

    val confidence: StatisticsConfidence
        get() = completeness.confidence

    val successRatePercent: Int?
        get() = rate(validatedPeriods, evaluatedPeriods)

    val trendPercentagePoints: Int?
        get() = comparison?.deltaPercentagePoints

    companion object {
        const val MIN_DAILY_EVALUATED_CONFIDENCE_LIMITED = 7
        const val MIN_DAILY_EVALUATED_CONFIDENCE_ESTABLISHED = 21

        const val MIN_WEEKLY_EVALUATED_CONFIDENCE_LIMITED = 2
        const val MIN_WEEKLY_EVALUATED_CONFIDENCE_ESTABLISHED = 4

        const val MIN_MONTHLY_EVALUATED_CONFIDENCE_LIMITED = 1

        const val MIN_DAILY_FOR_COMPARISON = 7
        const val MIN_WEEKLY_FOR_COMPARISON = 2
        const val MIN_MONTHLY_FOR_COMPARISON = 1

        fun confidenceFor(periodType: PeriodType?, evaluatedPeriods: Int): StatisticsConfidence = when (periodType) {
            PeriodType.DAY -> when {
                evaluatedPeriods >= MIN_DAILY_EVALUATED_CONFIDENCE_ESTABLISHED -> StatisticsConfidence.ESTABLISHED
                evaluatedPeriods >= MIN_DAILY_EVALUATED_CONFIDENCE_LIMITED -> StatisticsConfidence.LIMITED
                else -> StatisticsConfidence.INSUFFICIENT
            }
            PeriodType.WEEK -> when {
                evaluatedPeriods >= MIN_WEEKLY_EVALUATED_CONFIDENCE_ESTABLISHED -> StatisticsConfidence.ESTABLISHED
                evaluatedPeriods >= MIN_WEEKLY_EVALUATED_CONFIDENCE_LIMITED -> StatisticsConfidence.LIMITED
                else -> StatisticsConfidence.INSUFFICIENT
            }
            PeriodType.MONTH -> when {
                evaluatedPeriods >= MIN_MONTHLY_EVALUATED_CONFIDENCE_LIMITED -> StatisticsConfidence.LIMITED
                else -> StatisticsConfidence.INSUFFICIENT
            }
            null -> StatisticsConfidence.INSUFFICIENT
        }

        fun minEvaluatedForComparison(periodType: PeriodType): Int = when (periodType) {
            PeriodType.DAY -> MIN_DAILY_FOR_COMPARISON
            PeriodType.WEEK -> MIN_WEEKLY_FOR_COMPARISON
            PeriodType.MONTH -> MIN_MONTHLY_FOR_COMPARISON
        }

        /** A period belongs to the window in which it closes, using that day's historical version. */
        fun compute(
            habitAt: (LocalDate) -> HabitDefinition?,
            today: LocalDate,
            entries: List<HabitEntry>,
            pauses: List<HabitPause>,
        ): HabitStatisticsSummary {
            val from = today.minusDays(30)
            val previousFrom = from.minusDays(30)
            val evaluator = HabitEvaluator()
            val current = Totals()
            val previous = Totals()
            val currentTypes = mutableSetOf<PeriodType>()
            val previousTypes = mutableSetOf<PeriodType>()
            val days = mutableListOf<HabitStatisticsDay>()
            val periods = mutableListOf<HabitStatisticsPeriod>()
            for (offset in 0L until 60L) {
                val date = previousFrom.plusDays(offset)
                val habit = habitAt(date)
                if (date >= from) days += HabitStatisticsDay(date, dayStatus(habit, date, entries, pauses, evaluator))
                if (habit == null || habit.goal.isAbstinence || habit.goal.isTracker) continue
                val window = PeriodCalculator.window(date, habit.goal.period, habit.schedule.firstDayOfWeek)
                if (window.endExclusive != date.plusDays(1)) continue
                if (date < habit.startsOn) continue
                val totals = if (date >= from) current else previous
                val types = if (date >= from) currentTypes else previousTypes
                totals.observable++
                types += habit.goal.period
                val observed = generateSequence(window.start) { it.plusDays(1) }
                    .takeWhile { it < window.endExclusive }
                    .any { day ->
                        val version = habitAt(day)
                        version != null && !version.goal.isAbstinence && !version.goal.isTracker && isPlannedOn(version, day) &&
                            pauses.none { it.includes(day) }
                    }
                val evaluation = evaluator.evaluate(habit, date,
                    entries.filter { it.localDate >= habit.startsOn }, pauses)
                if (date >= from) {
                    val status = when {
                        !observed -> HabitStatisticsDayStatus.PAUSED
                        evaluation.isCompleted -> HabitStatisticsDayStatus.IDEAL
                        evaluation.validatesPeriod -> HabitStatisticsDayStatus.MINIMUM
                        else -> HabitStatisticsDayStatus.MISSED
                    }
                    periods += HabitStatisticsPeriod(window.start, window.endExclusive, habit.goal.period, status)
                }
                if (!observed) continue
                totals.evaluated++
                if (evaluation.validatesPeriod) totals.validated++
                if (evaluation.isCompleted) totals.ideal++
            }

            val allTypes = currentTypes + previousTypes
            val resolvedPeriodType = when {
                currentTypes.size == 1 -> currentTypes.single()
                previousTypes.size == 1 -> previousTypes.single()
                else -> allTypes.singleOrNull()
            }
            val isHomogeneous = when {
                currentTypes.isEmpty() && previousTypes.isEmpty() -> true
                currentTypes.isEmpty() -> previousTypes.size == 1
                previousTypes.isEmpty() -> currentTypes.size == 1
                else -> currentTypes.size == 1 && previousTypes.size == 1 && currentTypes.single() == previousTypes.single()
            }
            val comparison = if (isHomogeneous && resolvedPeriodType != null) {
                val minReq = minEvaluatedForComparison(resolvedPeriodType)
                if (current.evaluated >= minReq && previous.evaluated >= minReq) {
                    val currentRate = rate(current.validated, current.evaluated)
                    val previousRate = rate(previous.validated, previous.evaluated)
                    if (currentRate != null && previousRate != null) {
                        val delta = currentRate - previousRate
                        val trend = when {
                            delta > 0 -> StatisticsTrend.IMPROVING
                            delta < 0 -> StatisticsTrend.DECLINING
                            else -> StatisticsTrend.STABLE
                        }
                        HabitStatisticsComparison(currentRate, previousRate, delta, trend)
                    } else null
                } else null
            } else null

            return HabitStatisticsSummary(
                evaluatedPeriods = current.evaluated,
                validatedPeriods = current.validated,
                idealPeriods = current.ideal,
                previousEvaluatedPeriods = previous.evaluated,
                previousValidatedPeriods = previous.validated,
                previousIdealPeriods = previous.ideal,
                periodType = resolvedPeriodType,
                from = from,
                untilExclusive = today,
                previousFrom = previousFrom,
                days = days,
                periods = periods,
                observablePeriods = current.observable,
                previousObservablePeriods = previous.observable,
                comparison = comparison,
                isHomogeneous = isHomogeneous,
            )
        }

        private fun dayStatus(
            habit: HabitDefinition?,
            date: LocalDate,
            entries: List<HabitEntry>,
            pauses: List<HabitPause>,
            evaluator: HabitEvaluator,
        ): HabitStatisticsDayStatus {
            if (habit == null || habit.goal.isAbstinence || !isPlannedOn(habit, date)) return HabitStatisticsDayStatus.UNPLANNED
            if (habit.goal.isTracker) return if (entries.any { it.habitId == habit.id && it.localDate == date })
                HabitStatisticsDayStatus.ACTIVITY else HabitStatisticsDayStatus.NO_ACTIVITY
            if (pauses.any { it.includes(date) }) return HabitStatisticsDayStatus.PAUSED
            if (habit.goal.period != PeriodType.DAY) {
                return if (entries.any { it.habitId == habit.id && it.localDate == date }) {
                    HabitStatisticsDayStatus.ACTIVITY
                } else HabitStatisticsDayStatus.NO_ACTIVITY
            }
            val evaluation = evaluator.evaluate(habit, date, entries, pauses)
            return when {
                evaluation.isCompleted -> HabitStatisticsDayStatus.IDEAL
                evaluation.validatesPeriod -> HabitStatisticsDayStatus.MINIMUM
                else -> HabitStatisticsDayStatus.MISSED
            }
        }

        private fun rate(validated: Int, evaluated: Int): Int? =
            if (evaluated == 0) null else (validated * 100.0 / evaluated).roundToInt()

        private class Totals(
            var evaluated: Int = 0,
            var validated: Int = 0,
            var ideal: Int = 0,
            var observable: Int = 0,
        )
    }
}
