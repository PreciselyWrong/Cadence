package ch.nicolab.cadence.widget.today

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayPaletteTest {
    @Test
    fun `le fond flou est une teinte claire translucide dont l'opacite suit l'intensite`() {
        val palette = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.FLOU, intensity = 50))

        assertEquals(0x7FFFFFFF, palette.surface)
        assertEquals(0xFF1C1B1F.toInt(), palette.ink)
    }

    @Test
    fun `le fond verre est une teinte sombre et le texte reste clair`() {
        val palette = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.VERRE, intensity = 100))

        assertEquals(0xFF000000.toInt(), palette.surface)
        assertEquals(0xFFFFFFFF.toInt(), palette.ink)
    }

    @Test
    fun `le fond aucun ne pose aucune surface`() {
        val palette = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.AUCUN))

        assertEquals(0, palette.surface ushr 24)
    }

    @Test
    fun `la couleur de controle suit le reglage et la couleur libre`() {
        val palette = TodayPalette.of(TodayWidgetConfig(controlColour = ControlColour.LIBRE, freeControlArgb = 0xFF123456.toInt()))

        assertEquals(0xFF123456.toInt(), palette.accent)
    }

    @Test
    fun `les tailles de texte croissent du petit au grand`() {
        val small = TodayTextSizes.of(TodayTextSize.S)
        val large = TodayTextSizes.of(TodayTextSize.L)

        assertTrue(large.body > small.body)
    }
}
