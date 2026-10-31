package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.designsystem.theme.DarkPalette
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.designsystem.theme.compositeOver
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
    fun `le verre est translucide, borde d'un liseré et suit le theme`() {
        val palettes = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.VERRE))

        listOf(palettes.day, palettes.night).forEach {
            assertTrue((it.surface ushr 24) in 1 until 0xFF, "surface translucide")
            assertTrue((it.rim ushr 24) > 0, "liseré visible")
        }
        assertEquals(LightPalette.onSurface.toArgb(), palettes.day.ink)
        assertEquals(DarkPalette.onSurface.toArgb(), palettes.night.ink)
    }

    @Test
    fun `les fonds pleins n'ont pas de liseré`() {
        listOf(TodayBackground.AUTO, TodayBackground.CLAIR, TodayBackground.SOMBRE, TodayBackground.AUCUN).forEach { background ->
            val palettes = TodayPalette.of(TodayWidgetConfig(background = background))
            assertEquals(0, palettes.day.rim ushr 24, "$background")
            assertEquals(0, palettes.night.rim ushr 24, "$background")
        }
    }

    @Test
    fun `le texte du verre reste lisible sur n'importe quel fond d'ecran`() {
        val palettes = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.VERRE))
        listOf(palettes.day, palettes.night).forEach { palette ->
            (0..255 step 5).forEach { grey ->
                val wallpaper = (0xFF shl 24) or (grey shl 16) or (grey shl 8) or grey
                val seen = over(palette.surface, over(palette.rim, wallpaper))
                assertTrue(contrast(palette.ink, seen) >= 4.5, "encre sur gris $grey")
                assertTrue(contrast(palette.muted, seen) >= 4.5, "attenue sur gris $grey")
                assertTrue(contrast(palette.overdue, seen) >= 4.5, "retard sur gris $grey")
            }
        }
    }

    /** Couleur vue quand [top], avec son alpha, est posé sur [bottom] opaque. */
    private fun over(top: Int, bottom: Int): Int = compositeOver(top or (0xFF shl 24), (top ushr 24) / 255f, bottom)

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

    @Test
    fun `sur un fond d'ecran sombre connu le verre devient plus transparent`() {
        val wallpaper = listOf(0xFF000000.toInt(), 0xFF101018.toInt())
        val known = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.VERRE), wallpaper)
        val unknown = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.VERRE))

        assertTrue((known.night.surface ushr 24) < (unknown.night.surface ushr 24))
        assertTrue((known.night.surface ushr 24) / 255f >= TodayPalette.GLASS_MIN_ALPHA - 0.01f)
    }

    @Test
    fun `le verre reste lisible sur chaque couleur du fond d'ecran`() {
        val wallpaper = listOf(0xFF000000.toInt(), 0xFFFF6A00.toInt(), 0xFF2F6BFF.toInt(), 0xFFF2F2F2.toInt())
        val palettes = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.VERRE), wallpaper)
        listOf(palettes.day, palettes.night).forEach { palette ->
            wallpaper.forEach { colour ->
                val seen = over(palette.surface, over(palette.rim, colour))
                assertTrue(contrast(palette.ink, seen) >= 4.5, "encre sur ${Integer.toHexString(colour)}")
                assertTrue(contrast(palette.muted, seen) >= 4.5, "attenue sur ${Integer.toHexString(colour)}")
                assertTrue(contrast(palette.overdue, seen) >= 4.5, "retard sur ${Integer.toHexString(colour)}")
            }
        }
    }

    @Test
    fun `les cases prennent la couleur de la priorite et restent visibles`() {
        val palettes = TodayPalette.of(TodayWidgetConfig(background = TodayBackground.AUTO, controlColour = ControlColour.PRIORITE))
        listOf(palettes.day, palettes.night).forEach { palette ->
            val high = palette.checkTint(TaskPriority.HIGH, ControlColour.PRIORITE)
            val medium = palette.checkTint(TaskPriority.MEDIUM, ControlColour.PRIORITE)
            val low = palette.checkTint(TaskPriority.LOW, ControlColour.PRIORITE)
            val none = palette.checkTint(null, ControlColour.PRIORITE)

            assertEquals(palette.overdue, high)
            assertEquals(4, setOf(high, medium, low, none).size)
            listOf(high, medium, low, none).forEach { assertTrue(contrast(it, palette.surface) >= 3.0) }
        }
    }

    @Test
    fun `hors mode priorite la case garde la couleur de controle`() {
        val palette = TodayPalette.of(TodayWidgetConfig(controlColour = ControlColour.CORAIL)).night

        assertEquals(palette.accent, palette.checkTint(TaskPriority.HIGH, ControlColour.CORAIL))
    }
}
