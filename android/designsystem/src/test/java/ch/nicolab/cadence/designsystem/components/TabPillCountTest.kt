package ch.nicolab.cadence.designsystem.components

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TabPillCountTest {
    @Test
    fun `un onglet sans compteur ou a zero ne montre aucun chiffre`() {
        assertNull(TabPill("Notes").shownCount)
        assertNull(TabPill("Notes", 0).shownCount)
        assertEquals(3, TabPill("Notes", 3).shownCount)
    }
}
