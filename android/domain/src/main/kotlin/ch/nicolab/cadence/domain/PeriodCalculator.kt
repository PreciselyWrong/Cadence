package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.LocalDate

data class PeriodWindow(
    val start: LocalDate,
    val endExclusive: LocalDate,
) {
    fun includes(date: LocalDate): Boolean = date >= start && date < endExclusive
}

object PeriodCalculator {
    fun window(
        date: LocalDate,
        period: PeriodType,
        firstDayOfWeek: DayOfWeek = DayOfWeek.MONDAY,
    ): PeriodWindow = when (period) {
        PeriodType.DAY -> PeriodWindow(date, date.plusDays(1))
        PeriodType.WEEK -> {
            val daysFromStart = Math.floorMod(date.dayOfWeek.value - firstDayOfWeek.value, 7).toLong()
            val start = date.minusDays(daysFromStart)
            PeriodWindow(start, start.plusDays(7))
        }
        PeriodType.MONTH -> {
            val start = date.withDayOfMonth(1)
            PeriodWindow(start, start.plusMonths(1))
        }
    }
}
