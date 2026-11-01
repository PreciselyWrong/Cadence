package ch.nicolab.cadence.designsystem.components

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class SectionCountTest {
    @Test
    fun `un compteur absent ou a zero ne s'affiche pas`() {
        assertNull(visibleSectionCount(null))
        assertNull(visibleSectionCount(0))
        assertEquals(2, visibleSectionCount(2))
    }
}
