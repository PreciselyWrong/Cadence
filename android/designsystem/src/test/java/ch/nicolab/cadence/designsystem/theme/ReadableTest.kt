package ch.nicolab.cadence.designsystem.theme

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReadableTest {
    private val tints = listOf(
        0xFF1E6FD9.toInt(), 0xFFC77700.toInt(), 0xFFF5BD52.toInt(), 0xFFABF5A3.toInt(),
        0xFFE0483B.toInt(), 0xFF00897B.toInt(), 0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0xFF7D7AFF.toInt(),
    )

    @Test
    fun `readableOn reaches 4_5 on any opaque background`() {
        tints.forEach { background ->
            val ink = readableOn(background)
            assertTrue(contrastRatio(ink, background) >= 4.5, "fond ${background.toString(16)}")
        }
    }

    @Test
    fun `readableOn picks white on dark and ink on light`() {
        assertEquals(0xFFFFFFFF.toInt(), readableOn(0xFF1E3A8A.toInt()))
        assertEquals(0xFF1B1B21.toInt(), readableOn(0xFFF5BD52.toInt()))
    }

    @Test
    fun `readableTint reaches 4_5 on a pill derived from the tint`() {
        val surfaces = listOf(0xFFFDFCFF.toInt(), 0xFF121218.toInt())
        tints.forEach { tint ->
            surfaces.forEach { surface ->
                val pill = compositeOver(tint, 0.12f, surface)
                val text = readableTint(tint, pill)
                assertTrue(contrastRatio(text, pill) >= 4.5, "tint ${tint.toString(16)} sur ${surface.toString(16)}")
            }
        }
    }

    @Test
    fun `readableTint leaves an already readable tint untouched`() {
        val dark = 0xFF1E3A8A.toInt()
        assertEquals(dark, readableTint(dark, 0xFFFFFFFF.toInt()))
    }

    @Test
    fun `compositeOver blends by alpha`() {
        assertEquals(0xFF808080.toInt(), compositeOver(0xFF000000.toInt(), 0.5f, 0xFFFFFFFF.toInt()))
    }
}
