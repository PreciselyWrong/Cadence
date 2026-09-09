package ch.nicolab.cadence

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.util.Locale

class AbstinenceMoneyTest {
    @Test fun `daily amount accepts french decimal separator and stays in minor units`() {
        assertEquals(850L, parseDailySavingsMinor("8,50", "CHF"))
        assertEquals("8.5", dailySavingsInput(850L, "CHF"))
    }

    @Test fun `daily amount is optional and rejects imprecise or non-positive values`() {
        assertNull(parseDailySavingsMinor("", "CHF"))
        assertNull(parseDailySavingsMinor("-2", "CHF"))
        assertNull(parseDailySavingsMinor("1,234", "CHF"))
    }

    @Test fun `currency follows a country locale with a swiss fallback`() {
        assertEquals("CHF", defaultCurrencyCode(Locale.forLanguageTag("fr-CH")))
        assertEquals("CHF", defaultCurrencyCode(Locale.FRENCH))
    }
}
