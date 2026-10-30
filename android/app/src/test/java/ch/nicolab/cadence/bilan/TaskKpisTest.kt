package ch.nicolab.cadence.bilan

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskKpisTest {
    @Test
    fun `regularity averages the habits that have a rate`() {
        assertEquals(80, regularityPercent(listOf(90, null, 70)))
        assertEquals(86, regularityPercent(listOf(86)))
    }

    @Test
    fun `regularity is unknown without any rate`() {
        assertNull(regularityPercent(emptyList()))
        assertNull(regularityPercent(listOf(null, null)))
    }
}
