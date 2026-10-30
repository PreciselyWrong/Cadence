package ch.nicolab.cadence.designsystem.theme

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs

class AccentTest {
    private val white = 0xFFFFFFFF.toInt()
    private val ink = 0xFF1B1B21.toInt()
    private val freeColour = 0xFF808000.toInt()

    @Test
    fun `violet keeps the spec roles in light mode`() {
        val roles = deriveAccentRoles(AccentPreset.VIOLET.argb, dark = false)

        assertEquals(
            AccentRoles(
                primary = 0xFF5E5CE6.toInt(),
                onPrimary = 0xFFFFFFFF.toInt(),
                primaryContainer = 0xFFE4E3FF.toInt(),
                onPrimaryContainer = 0xFF16136B.toInt(),
            ),
            roles,
        )
    }

    @Test
    fun `violet keeps the spec roles in dark mode`() {
        val roles = deriveAccentRoles(AccentPreset.VIOLET.argb, dark = true)

        assertEquals(
            AccentRoles(
                primary = 0xFFA9A6FF.toInt(),
                onPrimary = 0xFF1B1680.toInt(),
                primaryContainer = 0xFF3A378F.toInt(),
                onPrimaryContainer = 0xFFE4E3FF.toInt(),
            ),
            roles,
        )
    }

    @Test
    fun `light primary is the seed and on-primary keeps the higher contrast`() {
        AccentPreset.entries.forEach { preset ->
            val roles = deriveAccentRoles(preset.argb, dark = false)
            val expectedOn = if (contrastRatio(preset.argb, white) >= contrastRatio(preset.argb, ink)) white else ink

            assertEquals(preset.argb, roles.primary, preset.id)
            assertEquals(expectedOn, roles.onPrimary, preset.id)
            // Sarcelle et Corail restent sous 4.5 avec ces deux seules encres (4.3 et 4.2) : seuil documenté.
            assertTrue(contrastRatio(roles.primary, roles.onPrimary) >= 4.0, "light contrast of ${preset.id}")
        }
    }

    @Test
    fun `dark on-primary reaches AA contrast for every preset`() {
        AccentPreset.entries.forEach { preset ->
            val roles = deriveAccentRoles(preset.argb, dark = true)

            assertTrue(contrastRatio(roles.primary, roles.onPrimary) >= 4.5, "dark contrast of ${preset.id}")
        }
    }

    @Test
    fun `light containers sit near lightness 92 percent and dark ones near 30 percent`() {
        val seeds = AccentPreset.entries.filter { it != AccentPreset.VIOLET }.map { it.argb } + freeColour

        seeds.forEach { seed ->
            val light = deriveAccentRoles(seed, dark = false).primaryContainer.toHsl().lightness
            val dark = deriveAccentRoles(seed, dark = true).primaryContainer.toHsl().lightness

            assertTrue(abs(light - 0.92f) <= 0.015f, "light container lightness $light for ${seed.toHex()}")
            assertTrue(abs(dark - 0.30f) <= 0.015f, "dark container lightness $dark for ${seed.toHex()}")
        }
    }

    @Test
    fun `containers keep the hue of a saturated seed`() {
        val seedHue = AccentPreset.CORAIL.argb.toHsl().hue

        listOf(false, true).forEach { dark ->
            val roles = deriveAccentRoles(AccentPreset.CORAIL.argb, dark)

            assertTrue(hueDistance(roles.primaryContainer.toHsl().hue, seedHue) <= 3f, "container hue, dark=$dark")
            assertTrue(hueDistance(roles.onPrimaryContainer.toHsl().hue, seedHue) <= 3f, "on-container hue, dark=$dark")
        }
    }

    @Test
    fun `a free colour derives usable roles in both modes`() {
        val light = deriveAccentRoles(freeColour, dark = false)
        val dark = deriveAccentRoles(freeColour, dark = true)

        assertEquals(freeColour, light.primary)
        assertTrue(light.onPrimary == white || light.onPrimary == ink)
        assertTrue(contrastRatio(light.primary, light.onPrimary) >= 4.0)
        assertTrue(contrastRatio(dark.primary, dark.onPrimary) >= 4.5)
    }

    @Test
    fun `contrast ratio follows WCAG for black and white`() {
        assertEquals(21.0, contrastRatio(0xFF000000.toInt(), white), 0.01)
        assertEquals(1.0, contrastRatio(white, white), 0.0001)
    }

    @Test
    fun `preset lookup resolves known ids only`() {
        assertSame(AccentPreset.BLEU, accentPresetOf("bleu"))
        assertNull(accentPresetOf("magenta"))
    }

    private fun hueDistance(a: Float, b: Float): Float {
        val d = abs(a - b) % 360f
        return if (d > 180f) 360f - d else d
    }

    private fun Int.toHex(): String = "#%06X".format(this and 0xFFFFFF)
}
