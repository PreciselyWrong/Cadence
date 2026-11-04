package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ProjectNotesTest {
    private fun note(uid: String, project: String?, pinned: Boolean = false) =
        NoteItem(uid = uid, title = uid, content = "", projectUid = project, pinned = pinned)

    @Test
    fun `garde les notes du projet, epinglees d'abord, dans l'ordre de la liste`() {
        val notes = listOf(note("a", "p1"), note("b", "p2"), note("c", null), note("d", "p1", pinned = true), note("e", "p1"))
        assertEquals(listOf("d", "a", "e"), ProjectNotes.of(notes, "p1").map { it.uid })
    }
}
