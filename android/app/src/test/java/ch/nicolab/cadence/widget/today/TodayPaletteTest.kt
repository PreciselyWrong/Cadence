package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.designsystem.theme.DarkPalette
import ch.nicolab.cadence.designsystem.theme.LightPalette
import androidx.compose.ui.graphics.toArgb
import kotlin.math.pow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayPaletteTest {
    private fun luminance(argb: Int): Double {
        fun channel(shift: Int): Double {
            val c = ((argb shr shift) and 0xFF) / 255.0
            return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
    }

    private fun contrast(a: Int, b: Int): Double {
        val (hi, lo) = listOf(luminance(a), luminance(b)).sortedDescending()
        return (hi + 0.05) / (lo + 0.05)
    }

    @Test
    fun `le mode automatique suit les jetons clair et sombre du design system`() {
        val palettes = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.AUTO))

        assertEquals(LightPalette.surface.toArgb(), palettes.day.surface)
        assertEquals(DarkPalette.surface.toArgb(), palettes.night.surface)
        assertEquals(LightPalette.onSurface.toArgb(), palettes.day.ink)
        assertEquals(DarkPalette.onSurface.toArgb(), palettes.night.ink)
    }

    @Test
    fun `clair et sombre forcent le meme theme de jour comme de nuit`() {
        val light = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.CLAIR))
        val dark = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.SOMBRE))

        assertEquals(light.day, light.night)
        assertEquals(dark.day, dark.night)
        assertEquals(DarkPalette.surface.toArgb(), dark.day.surface)
    }

    @Test
    fun `chaque fond plein est totalement opaque`() {
        listOf(TodayBackground.AUTO, TodayBackground.CLAIR, TodayBackground.SOMBRE).forEach { background ->
            val palettes = TodayPalette.of(TodayWidgetConfig(background = background))
            listOf(palettes.day, palettes.night).forEach { assertEquals(0xFF, it.surface ushr 24, "$background") }
        }
    }

    @Test
    fun `texte et texte attenue restent lisibles sur la surface, clair comme sombre`() {
        listOf(TodayBackground.AUTO, TodayBackground.CLAIR, TodayBackground.SOMBRE).forEach { background ->
            val palettes = TodayPalette.of(TodayWidgetConfig(background = background))
            listOf(palettes.day, palettes.night).forEach {
                assertTrue(contrast(it.ink, it.surface) >= 4.5, "encre $background")
                assertTrue(contrast(it.muted, it.surface) >= 4.5, "attenue $background")
                assertTrue(contrast(it.overdue, it.surface) >= 4.5, "retard $background")
            }
        }
    }

    @Test
    fun `le fond aucun ne pose aucune surface`() {
        val palettes = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.AUCUN))

        assertEquals(0, palettes.day.surface ushr 24)
        assertEquals(0, palettes.night.surface ushr 24)
    }

    @Test
    fun `la couleur de controle suit le reglage et la couleur libre`() {
        val palettes = TodayPalette.of(TodayWidgetConfig(controlColour = ControlColour.LIBRE, freeControlArgb = 0xFF123456.toInt()))

        assertEquals(0xFF123456.toInt(), palettes.day.accent)
        assertEquals(0xFF123456.toInt(), palettes.night.accent)
    }

    @Test
    fun `le controle blanc prend l'encre du theme pour rester visible sur fond clair`() {
        val palettes = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.AUTO, controlColour = ControlColour.BLANC))

        assertEquals(palettes.day.ink, palettes.day.accent)
        assertEquals(palettes.night.ink, palettes.night.accent)
    }

    @Test
    fun `les tailles de texte croissent du petit au grand`() {
        val small = TodayTextSizes.of(TodayTextSize.S)
        val large = TodayTextSizes.of(TodayTextSize.L)

        assertTrue(large.body > small.body)
    }
}
