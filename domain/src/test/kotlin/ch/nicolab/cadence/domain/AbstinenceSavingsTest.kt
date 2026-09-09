package ch.nicolab.cadence.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZoneId
import java.time.ZonedDateTime

class AbstinenceSavingsTest {
    private val start = Instant.parse("2026-01-01T00:00:00Z")

    @Test fun `daily and weekly declarations follow elapsed time exactly`() {
        assertEquals(425L, AbstinenceSavingsCalculator.calculate(850L, SavingsPeriod.DAY, start, start.plusSeconds(43_200), ZoneOffset.UTC))
        assertEquals(3_500L, AbstinenceSavingsCalculator.calculate(7_000L, SavingsPeriod.WEEK, start, start.plusSeconds(302_400), ZoneOffset.UTC))
    }

    @Test fun `monthly declaration follows the real length of its anchored month`() {
        val january31 = Instant.parse("2026-01-31T00:00:00Z")
        val february28 = Instant.parse("2026-02-28T00:00:00Z")
        assertEquals(12_000L, AbstinenceSavingsCalculator.calculate(12_000L, SavingsPeriod.MONTH, january31, february28, ZoneOffset.UTC))
        assertEquals(18_000L, AbstinenceSavingsCalculator.calculate(12_000L, SavingsPeriod.MONTH, january31, Instant.parse("2026-03-15T12:00:00Z"), ZoneOffset.UTC))
    }

    @Test fun `daily declaration follows a real local day across daylight saving time`() {
        val zone = ZoneId.of("Europe/Zurich")
        val localStart = ZonedDateTime.of(2026, 3, 29, 0, 0, 0, 0, zone)
        assertEquals(1_000L, AbstinenceSavingsCalculator.calculate(1_000L, SavingsPeriod.DAY, localStart.toInstant(), localStart.plusDays(1).toInstant(), zone))
    }

    @Test fun `missing declarations and time before start produce zero`() {
        assertEquals(0L, AbstinenceSavingsCalculator.calculate(null, SavingsPeriod.DAY, start, start.plusSeconds(1), ZoneOffset.UTC))
        assertEquals(0L, AbstinenceSavingsCalculator.calculate(850L, null, start, start.plusSeconds(1), ZoneOffset.UTC))
        assertEquals(0L, AbstinenceSavingsCalculator.calculate(850L, SavingsPeriod.DAY, start, start.minusSeconds(1), ZoneOffset.UTC))
    }

    @Test fun `very large declared spending is capped safely`() {
        assertEquals(Long.MAX_VALUE, AbstinenceSavingsCalculator.calculate(Long.MAX_VALUE, SavingsPeriod.DAY, start, start.plusSeconds(172_800), ZoneOffset.UTC))
    }
}
