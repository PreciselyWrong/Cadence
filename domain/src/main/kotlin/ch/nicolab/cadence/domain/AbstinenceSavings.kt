package ch.nicolab.cadence.domain

import java.math.BigInteger
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

enum class SavingsPeriod { DAY, WEEK, MONTH }

object AbstinenceSavingsCalculator {
    private val maxLong = BigInteger.valueOf(Long.MAX_VALUE)

    fun calculate(
        spendingMinor: Long?,
        period: SavingsPeriod?,
        activeStart: Instant,
        now: Instant,
        zoneId: ZoneId,
    ): Long {
        if (spendingMinor == null || spendingMinor < 0L || period == null || now <= activeStart) return 0L
        return calendarPeriods(spendingMinor, period, activeStart, now, zoneId)
    }

    private fun calendarPeriods(spendingMinor: Long, period: SavingsPeriod, start: Instant, now: Instant, zoneId: ZoneId): Long {
        val startAtZone = start.atZone(zoneId)
        val nowAtZone = now.atZone(zoneId)
        val unit = when (period) {
            SavingsPeriod.DAY -> ChronoUnit.DAYS
            SavingsPeriod.WEEK -> ChronoUnit.WEEKS
            SavingsPeriod.MONTH -> ChronoUnit.MONTHS
        }
        var fullPeriods = unit.between(startAtZone, nowAtZone).coerceAtLeast(0L)
        var boundary = startAtZone.plus(fullPeriods, unit)
        if (boundary.toInstant() > now) {
            fullPeriods--
            boundary = startAtZone.plus(fullPeriods, unit)
        }
        val nextBoundary = startAtZone.plus(fullPeriods + 1L, unit)
        val partial = proportional(
            spendingMinor,
            Duration.between(boundary.toInstant(), now).seconds,
            Duration.between(boundary.toInstant(), nextBoundary.toInstant()).seconds,
        )
        return clamp(BigInteger.valueOf(spendingMinor).multiply(BigInteger.valueOf(fullPeriods)).add(BigInteger.valueOf(partial)))
    }

    private fun proportional(spendingMinor: Long, elapsedSeconds: Long, periodSeconds: Long): Long = clamp(
        BigInteger.valueOf(spendingMinor)
            .multiply(BigInteger.valueOf(elapsedSeconds.coerceAtLeast(0L)))
            .divide(BigInteger.valueOf(periodSeconds)),
    )

    private fun clamp(value: BigInteger): Long = if (value > maxLong) Long.MAX_VALUE else value.toLong()
}
