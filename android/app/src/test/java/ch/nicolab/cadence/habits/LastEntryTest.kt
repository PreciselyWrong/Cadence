package ch.nicolab.cadence.habits

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class LastEntryTest {
    @Test
    fun `the sheet of the habit that was just logged can undo it`() {
        assertEquals("entry-1", LastEntry("entry-1", "water").undoableFor("water"))
    }

    @Test
    fun `the sheet of another habit cannot undo an entry it does not own`() {
        assertNull(LastEntry("entry-1", "water").undoableFor("meditation"))
    }
}
