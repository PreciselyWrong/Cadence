package ch.nicolab.cadence

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Locale

class AbstinenceMoneyTest {
    @Test fun `manual amount accepts french decimal separator and stays in minor units`() {
        assertEquals(850L, parseSavingsMinor("8,50", "CHF"))
        assertEquals("8.5", savingsInput(850L, "CHF"))
    }

    @Test fun `manual amount is optional and rejects imprecise or negative values`() {
        assertNull(parseSavingsMinor("", "CHF"))
        assertNull(parseSavingsMinor("-2", "CHF"))
        assertNull(parseSavingsMinor("1,234", "CHF"))
        assertEquals(0L, parseSavingsMinor("0", "CHF"))
    }

    @Test fun `currency follows a country locale with a swiss fallback`() {
        assertEquals("CHF", defaultCurrencyCode(Locale.forLanguageTag("fr-CH")))
        assertEquals("CHF", defaultCurrencyCode(Locale.FRENCH))
        assertTrue(isCurrencyCode("eur"))
        assertFalse(isCurrencyCode("EURO"))
    }
}
