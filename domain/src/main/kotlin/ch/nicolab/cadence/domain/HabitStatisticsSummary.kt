package ch.nicolab.cadence.domain

import java.time.LocalDate
import kotlin.math.roundToInt

enum class HabitStatisticsDayStatus { UNPLANNED, PAUSED, MISSED, MINIMUM, IDEAL, ACTIVITY, NO_ACTIVITY }

data class HabitStatisticsDay(val date: LocalDate, val status: HabitStatisticsDayStatus)

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
) {
    val successRatePercent: Int?
        get() = rate(validatedPeriods, evaluatedPeriods)

    val trendPercentagePoints: Int?
        get() {
            if (periodType == null) return null
            val current = successRatePercent ?: return null
            val previous = rate(previousValidatedPeriods, previousEvaluatedPeriods) ?: return null
            return current - previous
        }

    companion object {
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
            val types = mutableSetOf<PeriodType>()
            val days = mutableListOf<HabitStatisticsDay>()
            for (offset in 0L until 60L) {
                val date = previousFrom.plusDays(offset)
                val habit = habitAt(date)
                if (date >= from) days += HabitStatisticsDay(date, dayStatus(habit, date, entries, pauses, evaluator))
                if (habit == null || habit.goal.isAbstinence) continue
                val window = PeriodCalculator.window(date, habit.goal.period, habit.schedule.firstDayOfWeek)
                if (window.endExclusive != date.plusDays(1)) continue
                val observed = generateSequence(window.start) { it.plusDays(1) }
                    .takeWhile { it < window.endExclusive }
                    .any { day ->
                        val version = habitAt(day)
                        version != null && !version.goal.isAbstinence && isPlannedOn(version, day) &&
                            pauses.none { it.includes(day) }
                    }
                if (!observed) continue
                val evaluation = evaluator.evaluate(habit, date,
                    entries.filter { it.localDate >= habit.startsOn }, pauses)
                val totals = if (date >= from) current else previous
                totals.evaluated++
                if (evaluation.validatesPeriod) totals.validated++
                if (evaluation.isCompleted) totals.ideal++
                types += habit.goal.period
            }
            return HabitStatisticsSummary(current.evaluated, current.validated, current.ideal,
                previous.evaluated, previous.validated, previous.ideal, types.singleOrNull(),
                from, today, previousFrom, days)
        }

        /** Period counts are weighted directly; quantities and per-habit percentages are never summed. */
        fun aggregate(summaries: List<HabitStatisticsSummary>, today: LocalDate): HabitStatisticsSummary {
            require(summaries.all { it.untilExclusive == today && it.from == today.minusDays(30) }) {
                "Statistics windows must match"
            }
            val evaluated = summaries.filter { it.evaluatedPeriods + it.previousEvaluatedPeriods > 0 }
            val types = evaluated.map { it.periodType }.distinct()
            return HabitStatisticsSummary(
                summaries.sumOf { it.evaluatedPeriods }, summaries.sumOf { it.validatedPeriods },
                summaries.sumOf { it.idealPeriods }, summaries.sumOf { it.previousEvaluatedPeriods },
                summaries.sumOf { it.previousValidatedPeriods }, summaries.sumOf { it.previousIdealPeriods },
                types.singleOrNull(), today.minusDays(30), today, today.minusDays(60),
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

        private class Totals(var evaluated: Int = 0, var validated: Int = 0, var ideal: Int = 0)
    }
}
