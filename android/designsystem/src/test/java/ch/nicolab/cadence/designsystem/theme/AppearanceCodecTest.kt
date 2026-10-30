package ch.nicolab.cadence.designsystem.theme

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AppearanceCodecTest {
    private val freeColour = AccentChoice.Custom(0xFF12ABCD.toInt())

    @Test
    fun `every theme mode survives a round trip`() {
        ThemeMode.entries.forEach { mode ->
            val appearance = Appearance.Default.copy(themeMode = mode)

            assertEquals(appearance, AppearanceCodec.decode(AppearanceCodec.encode(appearance)), mode.name)
        }
    }

    @Test
    fun `every preset survives a round trip`() {
        AccentPreset.entries.forEach { preset ->
            val appearance = Appearance.Default.copy(accent = AccentChoice.Preset(preset))

            assertEquals(appearance, AppearanceCodec.decode(AppearanceCodec.encode(appearance)), preset.id)
        }
    }

    @Test
    fun `a free colour survives a round trip`() {
        val appearance = Appearance.Default.copy(accent = freeColour)

        assertEquals(appearance, AppearanceCodec.decode(AppearanceCodec.encode(appearance)))
    }

    @Test
    fun `both booleans survive a round trip`() {
        listOf(true, false).forEach { materialYou ->
            listOf(true, false).forEach { pureBlack ->
                val appearance = Appearance.Default.copy(materialYou = materialYou, pureBlack = pureBlack)

                assertEquals(appearance, AppearanceCodec.decode(AppearanceCodec.encode(appearance)))
            }
        }
    }

    @Test
    fun `a free colour is stored as an uppercase hex code`() {
        val stored = AppearanceCodec.encode(Appearance.Default.copy(accent = freeColour))

        assertEquals("#12ABCD", stored["accent"])
    }

    @Test
    fun `malformed accent falls back to the default accent only`() {
        val decoded = AppearanceCodec.decode(
            mapOf("accent" to "#zz", "theme_mode" to "dark", "pure_black" to "true"),
        )

        assertEquals(Appearance.Default.accent, decoded.accent)
        assertEquals(ThemeMode.DARK, decoded.themeMode)
        assertEquals(true, decoded.pureBlack)
    }

    @Test
    fun `unknown theme mode and non boolean flags fall back individually`() {
        val decoded = AppearanceCodec.decode(
            mapOf("theme_mode" to "foo", "material_you" to "yes", "pure_black" to "true", "accent" to "rose"),
        )

        assertEquals(Appearance.Default.themeMode, decoded.themeMode)
        assertEquals(Appearance.Default.materialYou, decoded.materialYou)
        assertEquals(true, decoded.pureBlack)
        assertEquals(AccentChoice.Preset(AccentPreset.ROSE), decoded.accent)
    }

    @Test
    fun `an empty map decodes to the defaults`() {
        assertEquals(Appearance.Default, AppearanceCodec.decode(emptyMap()))
    }

    @Test
    fun `null values decode to the defaults`() {
        assertEquals(Appearance.Default, AppearanceCodec.decode(mapOf<String, String?>("theme_mode" to null, "accent" to null)))
    }
}
