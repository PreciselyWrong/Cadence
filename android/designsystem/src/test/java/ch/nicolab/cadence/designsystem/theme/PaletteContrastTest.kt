package ch.nicolab.cadence.designsystem.theme

import androidx.compose.ui.graphics.toArgb
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Chaque variante d'Apparence (clair, sombre, noir pur × accents) garde ses textes à 4,5:1. */
class PaletteContrastTest {
    private val palettes = mapOf("clair" to LightPalette, "sombre" to DarkPalette, "noir pur" to PureBlackPalette)

    /** Préréglages et couleurs libres sur tout le cercle chromatique (pas de 15°). */
    private val seeds = AccentPreset.entries.map { it.argb } + (0 until 360 step 15).map { hueToArgb(it.toFloat()) }

    private fun assertReadable(fg: Int, bg: Int, what: String) {
        val ratio = contrastRatio(fg, bg)
        assertTrue(ratio >= 4.5, "$what : %.2f".format(ratio))
    }

    @Test
    fun `ink roles read on every surface`() {
        palettes.forEach { (name, p) ->
            listOf(p.background, p.card, p.containerHigh).forEach { surface ->
                listOf("onSurface" to p.onSurface, "onSurfaceVariant" to p.onSurfaceVariant, "outline" to p.outline)
                    .forEach { (role, ink) -> assertReadable(ink.toArgb(), surface.toArgb(), "$name $role") }
            }
            assertReadable(p.onError.toArgb(), p.error.toArgb(), "$name onError")
            assertReadable(p.onErrorContainer.toArgb(), p.errorContainer.toArgb(), "$name onErrorContainer")
        }
    }

    @Test
    fun `every accent keeps its on-roles and reads as text on cards`() {
        palettes.forEach { (name, p) ->
            seeds.forEach { seed ->
                val roles = deriveAccentRoles(seed, dark = p.isDark)
                val label = "$name accent #%06X".format(seed and 0xFFFFFF)
                assertReadable(roles.onPrimary, roles.primary, "$label onPrimary")
                assertReadable(roles.onPrimaryContainer, roles.primaryContainer, "$label onPrimaryContainer")
                assertReadable(roles.primary, p.background.toArgb(), "$label primary sur le fond")
                assertReadable(roles.primary, p.card.toArgb(), "$label primary sur une carte")
            }
        }
    }

    @Test
    fun `light accent keeps the hue of its seed`() {
        listOf(AccentPreset.AMBRE, AccentPreset.CORAIL, AccentPreset.SARCELLE).forEach { preset ->
            val primary = deriveAccentRoles(preset.argb, dark = false).primary
            assertEquals(preset.argb.toHsl().hue, primary.toHsl().hue, 2f, preset.id)
        }
    }

    @Test
    fun `text on a light accent in dark mode is dark, never the light onSurface`() {
        // Régression : un bouton accentué en thème sombre recevait onSurface (#E5E1EC) sur #A9A6FF.
        val ink = readableOn(DarkPalette.primary.toArgb())
        assertTrue(contrastRatio(ink, DarkPalette.primary.toArgb()) >= 4.5)
        assertTrue(relativeLuminance(ink) < relativeLuminance(DarkPalette.onSurface.toArgb()))
    }
}
