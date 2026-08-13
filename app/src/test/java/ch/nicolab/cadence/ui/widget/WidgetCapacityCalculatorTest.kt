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

    @Test
    fun `configured habits per row caps visible habits`() {
        val capacity = WidgetCapacityCalculator.calculateCapacity(
            availableWidthDp = 320,
            iconSizeDp = 24,
            showValues = false,
            totalHabitsCount = 20,
            maxHabitsPerRow = 3,
        )

        assertTrue(capacity <= 3)
    }

    @Test
    fun `configured density never exceeds six habits`() {
        val capacity = WidgetCapacityCalculator.calculateCapacity(
            availableWidthDp = 600,
            iconSizeDp = 24,
            showValues = false,
            totalHabitsCount = 20,
            maxHabitsPerRow = 20,
        )

        assertTrue(capacity <= 6)
    }
}
