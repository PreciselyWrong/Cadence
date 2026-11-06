package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import ch.nicolab.cadence.designsystem.theme.DarkPalette
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.designsystem.theme.PureBlackPalette
import ch.nicolab.cadence.designsystem.theme.compositeOver
import ch.nicolab.cadence.designsystem.theme.contrastRatio
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TimelineColorsTest {
    private fun solid(band: Color, under: Color) = compositeOver(band.copy(alpha = 1f).toArgb(), band.alpha, under.toArgb())

    @Test
    fun everyBandStandsOutFromTheTrack() {
        mapOf("clair" to LightPalette, "sombre" to DarkPalette, "noir pur" to PureBlackPalette).forEach { (name, palette) ->
            val colors = TimelineColors.of(palette)
            listOf("travail" to colors.work, "soir" to colors.evening, "événement" to colors.event, "conflit" to colors.conflict).forEach { (band, color) ->
                val ratio = contrastRatio(solid(color, colors.track), colors.track.toArgb())
                assertTrue(ratio >= 3.0, "$name $band : %.2f".format(ratio))
            }
        }
    }

    @Test
    fun eventTitlesReadOnTheirBar() {
        listOf(LightPalette, DarkPalette, PureBlackPalette).forEach { palette ->
            val colors = TimelineColors.of(palette)
            assertTrue(contrastRatio(colors.onEvent.toArgb(), colors.event.toArgb()) >= 4.5)
            assertTrue(contrastRatio(colors.onConflict.toArgb(), colors.conflict.toArgb()) >= 4.5)
        }
    }
}
