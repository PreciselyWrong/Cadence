package ch.nicolab.cadence.widget.today

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayWidgetLayoutTest {
    private val sizes = TodayTextSize.entries.map { TodayTextSizes.of(it) }

    @Test
    fun `les habitudes sont reservees avant la liste, a toutes les hauteurs`() {
        sizes.forEach { text ->
            val reserved = TodayWidgetLayout.reservedHeightDp(text, habitsShown = true)
            listOf(reserved, reserved + 10f, 200f, 400f, 900f).forEach { height ->
                val list = TodayWidgetLayout.listHeightDp(height, text, habitsShown = true)
                assertEquals(height - reserved, list, 0.001f)
            }
        }
    }

    @Test
    fun `agrandir le widget donne toute la place gagnee a la liste`() {
        val text = TodayTextSizes.of(TodayTextSize.M)
        val small = TodayWidgetLayout.listHeightDp(200f, text, habitsShown = true)
        val tall = TodayWidgetLayout.listHeightDp(500f, text, habitsShown = true)

        assertEquals(300f, tall - small, 0.001f)
    }

    @Test
    fun `sans habitudes la liste prend la place des habitudes`() {
        val text = TodayTextSizes.of(TodayTextSize.M)

        assertTrue(
            TodayWidgetLayout.listHeightDp(300f, text, habitsShown = false) >
                TodayWidgetLayout.listHeightDp(300f, text, habitsShown = true),
        )
    }

    @Test
    fun `la hauteur minimale du widget garde en-tete et habitudes entiers pour chaque taille de texte`() {
        sizes.forEach { text ->
            assertTrue(
                TodayWidgetLayout.reservedHeightDp(text, habitsShown = true) <= TodayWidgetLayout.MIN_HEIGHT_DP,
                "taille ${text.body}",
            )
        }
    }

    @Test
    fun `la hauteur de liste n'est jamais negative et la liste se cache sous une ligne`() {
        val text = TodayTextSizes.of(TodayTextSize.M)

        assertEquals(0f, TodayWidgetLayout.listHeightDp(10f, text, habitsShown = true), 0.001f)
        assertFalse(TodayWidgetLayout.listFits(TodayWidgetLayout.reservedHeightDp(text, true) + 5f, text, habitsShown = true))
        assertTrue(TodayWidgetLayout.listFits(TodayWidgetLayout.MIN_HEIGHT_DP + 80f, text, habitsShown = true))
    }
}
