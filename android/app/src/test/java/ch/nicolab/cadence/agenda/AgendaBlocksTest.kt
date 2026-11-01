package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.designsystem.theme.compositeOver
import ch.nicolab.cadence.designsystem.theme.contrastRatio
import java.time.LocalDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AgendaBlocksTest {

    // Cartes et encres des palettes clair, sombre et noir pur (designsystem/theme/Color.kt).
    private val palettes = listOf(
        Triple(0xFFF3F1FC.toInt(), 0xFF1B1B21.toInt(), 0xFF46464F.toInt()),
        Triple(0xFF1F1E2A.toInt(), 0xFFE5E1EC.toInt(), 0xFFC8C5D0.toInt()),
        Triple(0xFF121216.toInt(), 0xFFE5E1EC.toInt(), 0xFFC8C5D0.toInt()),
    )
    private val sources = listOf(
        0xFFFFD60A, 0xFFFF3B30, 0xFF0A84FF, 0xFF34C759, 0xFF8E8E93, 0xFFFFFFFF, 0xFF000000, 0xFFAF52DE,
    ).map { it.toInt() }

    @Test
    fun `block fill is opaque and keeps text and mark readable`() {
        for ((card, ink, variant) in palettes) for (source in sources) for (done in listOf(false, true)) {
            val colors = blockColors(source, card, ink, variant, done)
            assertEquals(0xFF, colors.fill ushr 24, "fill must be opaque")
            assertTrue(contrastRatio(colors.title, colors.fill) >= 4.5, "title on ${Integer.toHexString(source)}")
            assertTrue(contrastRatio(colors.meta, colors.fill) >= 4.5, "meta on ${Integer.toHexString(source)}")
            assertTrue(contrastRatio(colors.mark, colors.fill) >= 3.0, "mark on ${Integer.toHexString(source)}")
        }
    }

    @Test
    fun `block fill mixes the source into the card`() {
        val (card, ink, variant) = palettes[1]
        val yellow = 0xFFFFD60A.toInt()
        assertEquals(compositeOver(yellow, BLOCK_TINT, card), blockColors(yellow, card, ink, variant, done = false).fill)
        assertEquals(compositeOver(yellow, BLOCK_TINT_DONE, card), blockColors(yellow, card, ink, variant, done = true).fill)
    }

    @Test
    fun `half hour block keeps its title on one line next to the mark`() {
        val text = blockText(minutes = 30, heightDp = 26f, titleLineDp = 16f, timeLineDp = 16f, neededTitleLines = 2)
        assertEquals(BlockText(inline = true, titleLines = 1, showTime = false), text)
    }

    @Test
    fun `narrow hour block drops the time when the title needs the room`() {
        // Une heure : 54 dp, 42 dp utiles ; un titre de deux lignes (32) plus l'horaire (16) ne tient pas.
        val text = blockText(minutes = 60, heightDp = 54f, titleLineDp = 16f, timeLineDp = 16f, neededTitleLines = 2)
        assertEquals(BlockText(inline = false, titleLines = 2, showTime = false), text)
    }

    @Test
    fun `short title leaves room for the time`() {
        val text = blockText(minutes = 60, heightDp = 54f, titleLineDp = 16f, timeLineDp = 16f, neededTitleLines = 1)
        assertEquals(BlockText(inline = false, titleLines = 1, showTime = true), text)
    }

    @Test
    fun `tall block shows up to three title lines then the time`() {
        val text = blockText(minutes = 120, heightDp = 110f, titleLineDp = 16f, timeLineDp = 16f, neededTitleLines = 5)
        assertEquals(BlockText(inline = false, titleLines = 3, showTime = true), text)
    }

    @Test
    fun `split narrow column puts the mark above the title`() {
        // 3 jours : une colonne de ~103 dp garde le repère à côté ; partagée en deux (~51 dp), il passe au-dessus.
        assertTrue(markFitsBeside(87f))
        assertTrue(!markFitsBeside(35f))
        val text = blockText(
            minutes = 60, heightDp = 54f, titleLineDp = 16f, timeLineDp = 16f, neededTitleLines = 3, markAboveDp = 20f,
        )
        assertEquals(BlockText(inline = false, titleLines = 1, showTime = false), text)
    }

    @Test
    fun `split half hour block keeps the title alone rather than the mark and an ellipsis`() {
        val text = blockText(
            minutes = 30, heightDp = 26f, titleLineDp = 16f, timeLineDp = 16f, neededTitleLines = 1, markAboveDp = 20f,
        )
        assertTrue(text.inline)
    }

    @Test
    fun `marks tell tasks, events and habits apart`() {
        val at = LocalDateTime.parse("2026-11-01T09:00")
        val task = AgendaEntry.Task("t", "Batch", at, at.plusHours(1), allDay = false, done = false, colorArgb = null)
        val event = AgendaEntry.Event(
            EventInstanceKey(1, 2, 3), "Perso", "Canoë", at, at.plusHours(1), allDay = false, done = false, colorArgb = 0,
        )
        val habit = AgendaEntry.Habit("h", "Lire", at, at.plusMinutes(30), allDay = false, done = false, colorArgb = null)
        assertEquals(MarkShape.TASK, markShapeOf(task, checkEvents = true))
        assertEquals(MarkShape.EVENT_CHECK, markShapeOf(event, checkEvents = true))
        assertEquals(MarkShape.EVENT_DOT, markShapeOf(event, checkEvents = false))
        assertEquals(MarkShape.HABIT, markShapeOf(habit, checkEvents = true))
        assertNotEquals(markShapeOf(task, true), markShapeOf(event, true))
        assertTrue(MarkShape.TASK.toggles() && MarkShape.EVENT_CHECK.toggles())
        assertTrue(!MarkShape.EVENT_DOT.toggles() && !MarkShape.HABIT.toggles())
    }
}
