package ch.nicolab.cadence.designsystem.theme

import androidx.compose.ui.graphics.toArgb
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitCardColorsTest {
    private val tints = listOf(
        0xFF1E6FD9.toInt(), 0xFFC77700.toInt(), 0xFFF5BD52.toInt(), 0xFFABF5A3.toInt(), 0xFFE0483B.toInt(),
        0xFF00897B.toInt(), 0xFFC2185B.toInt(), 0xFF5E5CE6.toInt(), 0xFFA9A6FF.toInt(), 0xFFFFFFFF.toInt(),
        0xFF000000.toInt(), 0xFFFFFF00.toInt(), 0xFF808080.toInt(),
    )

    @Test
    fun `the ink of the theme reads at 4_5 on the filled part, whatever the tint`() {
        listOf(LightPalette, DarkPalette, PureBlackPalette).forEach { palette ->
            val ink = palette.onSurface.toArgb()
            tints.forEach { tint ->
                assertTrue(contrastRatio(ink, habitFillArgb(tint, ink)) >= 4.5, "teinte ${tint.toString(16)}")
            }
            assertTrue(contrastRatio(ink, palette.card.toArgb()) >= 4.5, "reste de la carte")
        }
    }

    @Test
    fun `a tint that already reads keeps its colour`() {
        val white = 0xFFFFFFFF.toInt()
        val blue = 0xFF1E6FD9.toInt()
        assertTrue(habitFillArgb(blue, white) == blue)
    }
}
