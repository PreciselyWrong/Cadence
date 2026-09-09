package ch.nicolab.cadence

import ch.nicolab.cadence.domain.HabitStatisticsDay
import ch.nicolab.cadence.domain.HabitStatisticsDayStatus

internal enum class StatisticsPulseLevel { QUIET, MISSED, ACTIVE, IDEAL }

/** Condense le calendrier en rythme décoratif; le détail quotidien reste dans le modal. */
internal fun List<HabitStatisticsDay>.toStatisticsPulse(maxDays: Int = 14): List<StatisticsPulseLevel> =
    takeLast(maxDays).map { day ->
        when (day.status) {
            HabitStatisticsDayStatus.IDEAL -> StatisticsPulseLevel.IDEAL
            HabitStatisticsDayStatus.MINIMUM, HabitStatisticsDayStatus.ACTIVITY -> StatisticsPulseLevel.ACTIVE
            HabitStatisticsDayStatus.MISSED -> StatisticsPulseLevel.MISSED
            HabitStatisticsDayStatus.UNPLANNED,
            HabitStatisticsDayStatus.PAUSED,
            HabitStatisticsDayStatus.NO_ACTIVITY,
            -> StatisticsPulseLevel.QUIET
        }
    }
