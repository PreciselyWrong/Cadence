package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class IdeaNotesTest {
    @Test
    fun `une idée d'une ligne devient un titre sans contenu`() {
        assertEquals(NoteChange(title = "Acheter du café", content = ""), IdeaNotes.change("Acheter du café"))
    }

    @Test
    fun `la première ligne fait le titre et la suite le contenu`() {
        assertEquals(
            NoteChange(title = "Idée", content = "Détails\nSuite"),
            IdeaNotes.change("Idée\n\nDétails\nSuite"),
        )
    }
}
