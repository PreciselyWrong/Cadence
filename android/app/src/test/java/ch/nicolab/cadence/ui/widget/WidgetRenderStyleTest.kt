package ch.nicolab.cadence.ui.widget

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WidgetRenderStyleTest {

    @Test
    fun `halo stays the reference style and the stored default`() {
        assertEquals("HALO", WidgetRenderStyle.DEFAULT_ID)
        assertEquals(WidgetRenderStyle.DEFAULT_ID, WidgetRenderStyle.all.first().id)
    }

    @Test
    fun `an unknown or missing style falls back to halo`() {
        assertEquals(WidgetRenderStyle.default, WidgetRenderStyle.byId(null))
        assertEquals(WidgetRenderStyle.default, WidgetRenderStyle.byId("LEGACY"))
    }

    @Test
    fun `every style is reachable by its own identifier`() {
        WidgetRenderStyle.all.forEach { style ->
            assertEquals(style, WidgetRenderStyle.byId(style.id))
        }
    }

    @Test
    fun `identifiers are unique`() {
        val ids = WidgetRenderStyle.all.map(WidgetRenderStyle::id)

        assertEquals(ids.size, ids.distinct().size)
    }

    @Test
    fun `the styles shipped before the contract keep their appearance`() {
        val halo = WidgetRenderStyle.byId("HALO")
        assertEquals(0xFF171B2E.toInt(), halo.surfaceArgb)
        assertEquals(0xFFF7F8FC.toInt(), halo.contentArgb)
        assertFalse(halo.isLight)

        val mono = WidgetRenderStyle.byId("MONO")
        assertEquals(0xFFF7F8FC.toInt(), mono.surfaceArgb)
        assertEquals(0xFF172033.toInt(), mono.contentArgb)
        assertTrue(mono.isLight)

        listOf("OCEAN", "FOREST", "AUBERGINE", "CORAL").forEach { id ->
            assertNotNull(WidgetRenderStyle.all.firstOrNull { it.id == id })
        }
    }

    @Test
    fun `a light style keeps a readable badge over its own surface`() {
        WidgetRenderStyle.all.forEach { style ->
            assertTrue(style.badgeAlpha > 0f && style.badgeAlpha <= 1f, "badge alpha of ${style.id}")
            assertTrue(style.cornerRadiusDp >= 0, "corner radius of ${style.id}")
        }
    }

    @Test
    fun `the contract offers more than the reference style`() {
        assertTrue(WidgetRenderStyle.all.size > 6)
    }

    @Test
    fun `a swatch is the surface a light style is recognised by`() {
        WidgetRenderStyle.all.forEach { style ->
            assertEquals(0xFF, style.swatchArgb ushr 24, "swatch of ${style.id} must stay opaque")
        }
    }
}
