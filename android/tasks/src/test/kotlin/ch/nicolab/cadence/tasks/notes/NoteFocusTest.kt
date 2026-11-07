package ch.nicolab.cadence.tasks.notes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class NoteFocusTest {
    @Test
    fun `une note pas encore creee commence par son titre`() {
        assertEquals(NoteFocus.TITLE, NoteFocus.onOpen(exists = false, title = "", firstFocus = true))
    }

    @Test
    fun `une note nee de l'ajout rapide avec un titre commence par son contenu`() {
        assertEquals(NoteFocus.BODY, NoteFocus.onOpen(exists = true, title = "Courses", firstFocus = true))
    }

    @Test
    fun `une note sans titre commence par son titre`() {
        assertEquals(NoteFocus.TITLE, NoteFocus.onOpen(exists = true, title = "  ", firstFocus = true))
    }

    @Test
    fun `repasser en edition va toujours au contenu`() {
        assertEquals(NoteFocus.BODY, NoteFocus.onOpen(exists = true, title = "", firstFocus = false))
    }
}
