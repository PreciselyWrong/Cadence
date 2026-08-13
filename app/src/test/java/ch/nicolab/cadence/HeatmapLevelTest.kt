package ch.nicolab.cadence

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HeatmapLevelTest {
    @Test fun `levels express daily progress`() {
        assertEquals(0, HeatmapLevel.of(0, 10, false))
        assertEquals(1, HeatmapLevel.of(2, 10, false))
        assertEquals(2, HeatmapLevel.of(4, 10, false))
        assertEquals(3, HeatmapLevel.of(7, 10, false))
        assertEquals(4, HeatmapLevel.of(10, 10, false))
    }

    @Test fun `paused day stays neutral`() {
        assertEquals(0, HeatmapLevel.of(10, 10, true))
    }
}
