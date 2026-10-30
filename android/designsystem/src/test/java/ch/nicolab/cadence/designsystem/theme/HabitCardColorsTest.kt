package ch.nicolab.cadence.designsystem.theme

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitCardColorsTest {
    private val tints = listOf(
        0xFF1E6FD9.toInt(), 0xFFC77700.toInt(), 0xFFF5BD52.toInt(), 0xFFABF5A3.toInt(), 0xFFE0483B.toInt(),
        0xFF00897B.toInt(), 0xFFC2185B.toInt(), 0xFF5E5CE6.toInt(), 0xFFA9A6FF.toInt(), 0xFFFFFFFF.toInt(),
        0xFF000000.toInt(), 0xFFFFFF00.toInt(), 0xFF808080.toInt(),
    )

    @Test
    fun `ink reads at 4_5 on every gradient stop`() {
        tints.forEach { tint ->
            val colors = habitCardColors(tint)
            assertEquals(3, colors.stopsArgb.size)
            colors.stopsArgb.forEach { stop ->
                assertTrue(contrastRatio(colors.inkArgb, stop) >= 4.5, "teinte ${tint.toString(16)} arrêt ${stop.toString(16)}")
            }
        }
    }

    @Test
    fun `the action pill text reads at 4_5 on the pill`() {
        tints.forEach { tint ->
            val colors = habitCardColors(tint)
            assertTrue(contrastRatio(colors.inkArgb, colors.pillBackdropArgb) >= 4.5, "teinte ${tint.toString(16)}")
        }
    }

    @Test
    fun `a saturated blue gets white ink and a pale yellow gets dark ink`() {
        assertEquals(0xFFFFFFFF.toInt(), habitCardColors(0xFF1E6FD9.toInt()).inkArgb)
        assertEquals(0xFF1B1B21.toInt(), habitCardColors(0xFFF5BD52.toInt()).inkArgb)
    }
}
