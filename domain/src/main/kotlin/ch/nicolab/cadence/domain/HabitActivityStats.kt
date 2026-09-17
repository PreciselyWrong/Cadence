package ch.nicolab.cadence.domain

import java.time.LocalDate
import kotlin.math.roundToLong

/** Recorded activity stays visible even when a goal was missed or the habit was paused. */
data class HabitActivityStats(
    val entries30: Int,
    val activeDays30: Int,
    val totalMinor30: Long,
    val peakDayMinor30: Long,
    val averagePerActiveDayMinor30: Long?,
) {
    companion object {
        fun compute(habitId: String, startsOn: LocalDate, today: LocalDate, entries: List<HabitEntry>): HabitActivityStats {
            val from = maxOf(startsOn, today.minusDays(29))
            val recent = entries.filter { it.habitId == habitId && it.localDate >= from && it.localDate <= today }
            val dailyTotals = recent.groupBy(HabitEntry::localDate).values.map { day -> day.sumOf(HabitEntry::valueMinor) }
            val total = dailyTotals.sum()
            return HabitActivityStats(
                entries30 = recent.size,
                activeDays30 = dailyTotals.size,
                totalMinor30 = total,
                peakDayMinor30 = dailyTotals.maxOrNull() ?: 0,
                averagePerActiveDayMinor30 = dailyTotals.takeIf { it.isNotEmpty() }
                    ?.let { (total.toDouble() / it.size).roundToLong() },
            )
        }
    }
}
