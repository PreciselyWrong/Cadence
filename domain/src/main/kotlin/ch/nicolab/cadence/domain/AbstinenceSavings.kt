package ch.nicolab.cadence.domain

import java.math.BigInteger

object AbstinenceSavings {

    private const val SECONDS_PER_DAY = 86_400L

    private val BIG_SECONDS_PER_DAY = BigInteger.valueOf(SECONDS_PER_DAY)
    private val BIG_MAX_LONG = BigInteger.valueOf(Long.MAX_VALUE)

    fun calculate(dailyCostMinor: Long?, elapsedSeconds: Long?): Long {
        if (dailyCostMinor == null || dailyCostMinor <= 0L || elapsedSeconds == null || elapsedSeconds <= 0L) {
            return 0L
        }
        return compute(dailyCostMinor, BigInteger.valueOf(elapsedSeconds))
    }

    fun calculate(dailyCostMinor: Long?, elapsed: AbstinenceElapsed?): Long {
        if (dailyCostMinor == null || dailyCostMinor <= 0L || elapsed == null) {
            return 0L
        }
        val extraSeconds = elapsed.hours * 3600L + elapsed.minutes * 60L + elapsed.seconds
        val totalSeconds = BigInteger.valueOf(elapsed.days)
            .multiply(BIG_SECONDS_PER_DAY)
            .add(BigInteger.valueOf(extraSeconds))
        return compute(dailyCostMinor, totalSeconds)
    }

    private fun compute(dailyCostMinor: Long, totalSeconds: BigInteger): Long {
        if (totalSeconds <= BigInteger.ZERO) return 0L
        val saved = BigInteger.valueOf(dailyCostMinor)
            .multiply(totalSeconds)
            .divide(BIG_SECONDS_PER_DAY)
        return if (saved > BIG_MAX_LONG) Long.MAX_VALUE else saved.toLong()
    }
}
