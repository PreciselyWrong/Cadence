package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Recorded activity stays visible even when a goal was missed or the habit was paused. */
data class HabitActivityStats(
    val entries30: Int,
    val activeDays30: Int,
    val totalMinor30: Long,
    val peakDayMinor30: Long,
    val averagePerActiveDayMinor30: Double?,
    val calendarDays30: Int,
    val entries90: Int,
    val activeDays90: Int,
    val totalMinor90: Long,
    val calendarDays90: Int,
    val entries365: Int = entries90,
    val activeDays365: Int = activeDays90,
    val totalMinor365: Long = totalMinor90,
    val calendarDays365: Int = calendarDays90,
    val entriesAllTime: Int = entries90,
    val activeDaysAllTime: Int = activeDays90,
    val totalMinorAllTime: Long = totalMinor90,
    val calendarDaysAllTime: Int = calendarDays90,
) {
    companion object {
        fun compute(habitId: String, startsOn: LocalDate, today: LocalDate, entries: List<HabitEntry>): HabitActivityStats {
            val from = maxOf(startsOn, today.minusDays(29))
            val from90 = maxOf(startsOn, today.minusDays(89))
            val from365 = maxOf(startsOn, today.minusDays(364))
            val allTime = entries.filter { it.habitId == habitId && it.localDate >= startsOn && it.localDate <= today }
            val recent365 = allTime.filter { it.localDate >= from365 }
            val recent90 = recent365.filter { it.localDate >= from90 }
            val recent = recent90.filter { it.localDate >= from }
            val dailyTotals = recent.groupBy(HabitEntry::localDate).values.map { day -> day.sumOf(HabitEntry::valueMinor) }
            val total = dailyTotals.sum()
            return HabitActivityStats(
                entries30 = recent.size,
                activeDays30 = dailyTotals.size,
                totalMinor30 = total,
                peakDayMinor30 = dailyTotals.maxOrNull() ?: 0,
                averagePerActiveDayMinor30 = dailyTotals.takeIf { it.isNotEmpty() }
                    ?.let { total.toDouble() / it.size },
                calendarDays30 = calendarDays(from, today),
                entries90 = recent90.size,
                activeDays90 = recent90.map(HabitEntry::localDate).distinct().size,
                totalMinor90 = recent90.sumOf(HabitEntry::valueMinor),
                calendarDays90 = calendarDays(from90, today),
                entries365 = recent365.size,
                activeDays365 = recent365.map(HabitEntry::localDate).distinct().size,
                totalMinor365 = recent365.sumOf(HabitEntry::valueMinor),
                calendarDays365 = calendarDays(from365, today),
                entriesAllTime = allTime.size,
                activeDaysAllTime = allTime.map(HabitEntry::localDate).distinct().size,
                totalMinorAllTime = allTime.sumOf(HabitEntry::valueMinor),
                calendarDaysAllTime = calendarDays(startsOn, today),
            )
        }

        private fun calendarDays(from: LocalDate, today: LocalDate): Int =
            if (from > today) 0 else (ChronoUnit.DAYS.between(from, today) + 1).toInt()
    }
}
