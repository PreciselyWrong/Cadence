package ch.nicolab.cadence.ui.widget

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class WidgetCapacityCalculatorTest {
    @Test
    fun `wider widget exposes more pending habits`() {
        val narrow = WidgetCapacityCalculator.calculateCapacity(140, 32, 20)
        val wide = WidgetCapacityCalculator.calculateCapacity(320, 32, 20)
        assertTrue(wide > narrow)
    }

    @Test
    fun `configured habits per row caps visible habits`() {
        val capacity = WidgetCapacityCalculator.calculateCapacity(
            availableWidthDp = 320,
            iconSizeDp = 24,
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
            totalHabitsCount = 20,
            maxHabitsPerRow = 20,
        )

        assertTrue(capacity <= 6)
    }

    @Test
    fun `six icons fit without reserving width for a plus badge`() {
        val capacity = WidgetCapacityCalculator.calculateCapacity(320, 24, 20, 6)

        assertEquals(6, capacity)
    }

    @Test
    fun `short height hides text but keeps icon count`() {
        val compact = WidgetLayoutCalculator.resolve(48, 32, true, true)
        val tall = WidgetLayoutCalculator.resolve(104, 32, true, true)

        assertEquals(false, compact.showLabels)
        assertEquals(false, compact.showValues)
        assertEquals(true, tall.showLabels)
        assertEquals(true, tall.showValues)
    }
}
