package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PinnedShortcutsTest {
    @Test
    fun `les projets puis les notes epingles, dans l'ordre des listes`() {
        val shortcuts = PinnedShortcuts.of(
            projects = listOf(
                ProjectItem(uid = "p1", name = "Jardin", pinToSidebar = true, color = "#22c55e", icon = "yard"),
                ProjectItem(uid = "p2", name = "Impôts"),
                ProjectItem(uid = "p3", name = "Vacances", pinToSidebar = true),
            ),
            notes = listOf(
                NoteItem(uid = "n1", title = "Lectures", content = "", pinned = true),
                NoteItem(uid = "n2", title = "Brouillon", content = ""),
            ),
        )

        assertEquals(
            listOf(
                PinnedShortcut(PinnedShortcut.Kind.PROJECT, "p1", "Jardin", icon = "yard", color = "#22c55e"),
                PinnedShortcut(PinnedShortcut.Kind.PROJECT, "p3", "Vacances"),
                PinnedShortcut(PinnedShortcut.Kind.NOTE, "n1", "Lectures"),
            ),
            shortcuts,
        )
    }

    @Test
    fun `une note sans titre prend sa premiere ligne`() {
        val shortcuts = PinnedShortcuts.of(
            projects = emptyList(),
            notes = listOf(NoteItem(uid = "n1", title = " ", content = "\n  Idées de cadeaux\nsuite", pinned = true)),
        )

        assertEquals("Idées de cadeaux", shortcuts.single().name)
    }

    @Test
    fun `rien d'epingle, rien a montrer`() {
        assertEquals(emptyList<PinnedShortcut>(), PinnedShortcuts.of(listOf(ProjectItem(uid = "p", name = "P")), emptyList()))
    }
}
