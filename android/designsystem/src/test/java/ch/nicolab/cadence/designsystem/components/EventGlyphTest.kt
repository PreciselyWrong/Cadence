package ch.nicolab.cadence.designsystem.components

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class EventGlyphTest {
    @Test
    fun `un evenement non fait montre l'agenda, un fait l'agenda coche`() {
        assertEquals(EventGlyph.CALENDAR, eventGlyphOf(done = false))
        assertEquals(EventGlyph.CALENDAR_CHECKED, eventGlyphOf(done = true))
    }
}
