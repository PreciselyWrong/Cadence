package ch.nicolab.cadence.tasks.links

import ch.nicolab.cadence.tasks.model.TaskItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskLinksTest {
    private fun task(name: String = "t", note: String? = null, source: String? = null, url: String? = null) =
        TaskItem(uid = "t", name = name, note = note, source = source, sourceUrl = url)

    @Test
    fun `la première adresse de la note, son site et les mots laissés autour`() {
        assertEquals(
            TaskLink("https://www.github.com/acme/rocket", "github.com", "pour la compilation", iconInBadge = false, nameIsLink = false),
            TaskLinks.of(task(note = "https://www.github.com/acme/rocket\n\npour la compilation")),
        )
    }

    @Test
    fun `l'icône n'est pas répétée quand la pastille d'origine la montre`() {
        val link = TaskLinks.of(task(note = "https://github.com/acme/rocket", source = "link", url = "https://github.com/acme/rocket"))
        assertEquals(true, link?.iconInBadge)
        assertEquals("", link?.noteRest)
        assertEquals(false, link?.nameIsLink)
    }

    @Test
    fun `prend une adresse saisie comme nom quand la note n'en a pas`() {
        assertEquals(
            TaskLink("https://github.com/thedotmack/claude-mem", "github.com", "", iconInBadge = false, nameIsLink = true),
            TaskLinks.of(task(name = "https://github.com/thedotmack/claude-mem", note = "")),
        )
        assertFalse(TaskLinks.of(task(name = "Read https://example.org/a", note = null))!!.nameIsLink)
    }

    @Test
    fun `titre une adresse nue par le titre de la page, sinon hote et chemin`() {
        val link = TaskLinks.of(task(name = "https://github.com/thedotmack/claude-mem"))!!
        assertEquals(
            "claude-mem: memory for Claude",
            TaskLinks.titleOf("https://github.com/thedotmack/claude-mem", link, "claude-mem: memory for Claude"),
        )
        assertEquals(
            "github.com/thedotmack/claude-mem",
            TaskLinks.titleOf("https://github.com/thedotmack/claude-mem", link, null),
        )
        assertEquals("Call the bank", TaskLinks.titleOf("Call the bank", null, null))
    }

    @Test
    fun `rien pour une note et un nom sans adresse`() {
        assertNull(TaskLinks.of(task(note = "appeler la banque")))
        assertNull(TaskLinks.of(task(note = null)))
    }
}
