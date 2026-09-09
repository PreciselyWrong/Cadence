package ch.nicolab.cadence.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AbstinenceSavingsTest {

    @Test
    fun `exact daily cost for 86400 seconds`() {
        val dailyCostMinor = 1_500L
        val saved = AbstinenceSavings.calculate(dailyCostMinor = dailyCostMinor, elapsedSeconds = 86_400L)
        assertEquals(1_500L, saved)
    }

    @Test
    fun `proportional progression for multiple days and fractional days`() {
        val dailyCostMinor = 2_000L
        val halfDaySaved = AbstinenceSavings.calculate(dailyCostMinor, 43_200L)
        assertEquals(1_000L, halfDaySaved)

        val threeDaysSaved = AbstinenceSavings.calculate(dailyCostMinor, 86_400L * 3)
        assertEquals(6_000L, threeDaysSaved)
    }

    @Test
    fun `rounds down fractional minor units`() {
        val dailyCostMinor = 15L
        val halfDaySaved = AbstinenceSavings.calculate(dailyCostMinor, 43_200L)
        assertEquals(7L, halfDaySaved)

        val shortElapsedSaved = AbstinenceSavings.calculate(100L, 10L)
        assertEquals(0L, shortElapsedSaved)
    }

    @Test
    fun `null zero and negative inputs return zero`() {
        assertEquals(0L, AbstinenceSavings.calculate(null, 86_400L))
        assertEquals(0L, AbstinenceSavings.calculate(0L, 86_400L))
        assertEquals(0L, AbstinenceSavings.calculate(-500L, 86_400L))

        assertEquals(0L, AbstinenceSavings.calculate(1_000L, null as Long?))
        assertEquals(0L, AbstinenceSavings.calculate(1_000L, 0L))
        assertEquals(0L, AbstinenceSavings.calculate(1_000L, -86_400L))

        assertEquals(0L, AbstinenceSavings.calculate(null, null as Long?))
        assertEquals(0L, AbstinenceSavings.calculate(-1_000L, -86_400L))
    }

    @Test
    fun `prevents overflow with large values and caps at Long MAX_VALUE`() {
        val exactMax = AbstinenceSavings.calculate(Long.MAX_VALUE, 86_400L)
        assertEquals(Long.MAX_VALUE, exactMax)

        val clampedDoubleDay = AbstinenceSavings.calculate(Long.MAX_VALUE, 86_400L * 2)
        assertEquals(Long.MAX_VALUE, clampedDoubleDay)

        val clampedMaxBoth = AbstinenceSavings.calculate(Long.MAX_VALUE, Long.MAX_VALUE)
        assertEquals(Long.MAX_VALUE, clampedMaxBoth)
    }

    @Test
    fun `calculates savings from AbstinenceElapsed model`() {
        val dailyCostMinor = 2_000L
        val elapsed = AbstinenceElapsed(days = 1L, hours = 12, minutes = 0, seconds = 0)
        assertEquals(3_000L, AbstinenceSavings.calculate(dailyCostMinor, elapsed))

        assertEquals(0L, AbstinenceSavings.calculate(dailyCostMinor, AbstinenceElapsed.ZERO))
        assertEquals(0L, AbstinenceSavings.calculate(null, elapsed))
        assertEquals(0L, AbstinenceSavings.calculate(dailyCostMinor, null as AbstinenceElapsed?))
    }
}
