package ch.nicolab.cadence

import ch.nicolab.cadence.domain.AbstinenceProfile
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AbstinenceProfileOrderTest {
    @Test
    fun `sorts localized labels alphabetically and keeps custom last`() {
        val labels = mapOf(
            AbstinenceProfile.SMOKING to "Cigarette",
            AbstinenceProfile.ALCOHOL to "Alcool",
            AbstinenceProfile.CAFFEINE to "Caféine",
            AbstinenceProfile.CUSTOM to "Autre",
        )

        assertEquals(
            listOf(
                AbstinenceProfile.ALCOHOL,
                AbstinenceProfile.CAFFEINE,
                AbstinenceProfile.SMOKING,
                AbstinenceProfile.CUSTOM,
            ),
            sortedAbstinenceProfiles(labels.keys) { labels.getValue(it) },
        )
    }
}
