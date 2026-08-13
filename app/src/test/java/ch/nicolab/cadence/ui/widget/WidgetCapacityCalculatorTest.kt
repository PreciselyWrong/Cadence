package ch.nicolab.cadence.ui.widget

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WidgetCapacityCalculatorTest {
    @Test
    fun `wider widget exposes more pending habits`() {
        val narrow = WidgetCapacityCalculator.calculateCapacity(140, 32, true, 20)
        val wide = WidgetCapacityCalculator.calculateCapacity(320, 32, true, 20)
        assertTrue(wide > narrow)
    }
}
