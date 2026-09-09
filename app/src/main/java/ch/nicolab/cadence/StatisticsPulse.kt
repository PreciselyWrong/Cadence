package ch.nicolab.cadence

import ch.nicolab.cadence.domain.HabitStatisticsPeriod
import ch.nicolab.cadence.domain.HabitStatisticsDayStatus

internal enum class StatisticsPulseLevel { QUIET, MISSED, ACTIVE, IDEAL }

/** Une barre représente une période close; l'activité quotidienne reste dans le détail. */
internal fun List<HabitStatisticsPeriod>.toStatisticsPulse(maxPeriods: Int = 14): List<StatisticsPulseLevel> =
    takeLast(maxPeriods).map { period ->
        when (period.status) {
            HabitStatisticsDayStatus.IDEAL -> StatisticsPulseLevel.IDEAL
            HabitStatisticsDayStatus.MINIMUM, HabitStatisticsDayStatus.ACTIVITY -> StatisticsPulseLevel.ACTIVE
            HabitStatisticsDayStatus.MISSED -> StatisticsPulseLevel.MISSED
            HabitStatisticsDayStatus.UNPLANNED,
            HabitStatisticsDayStatus.PAUSED,
            HabitStatisticsDayStatus.NO_ACTIVITY,
            -> StatisticsPulseLevel.QUIET
        }
    }
