package ch.nicolab.cadence.tasks.links

import ch.nicolab.cadence.tasks.model.TaskItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskLinksTest {
    private fun task(note: String?, source: String? = null, url: String? = null) =
        TaskItem(uid = "t", name = "t", note = note, source = source, sourceUrl = url)

    @Test
    fun `la première adresse de la note, son site et les mots laissés autour`() {
        assertEquals(
            TaskLink("https://www.github.com/acme/rocket", "github.com", "pour la compilation", iconInBadge = false),
            TaskLinks.of(task("https://www.github.com/acme/rocket\n\npour la compilation")),
        )
    }

    @Test
    fun `l'icône n'est pas répétée quand la pastille d'origine la montre`() {
        val link = TaskLinks.of(task("https://github.com/acme/rocket", "link", "https://github.com/acme/rocket"))
        assertEquals(true, link?.iconInBadge)
        assertEquals("", link?.noteRest)
    }

    @Test
    fun `rien pour une note sans adresse`() {
        assertNull(TaskLinks.of(task("appeler la banque")))
        assertNull(TaskLinks.of(task(null)))
    }
}
