package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskSourcesTest {
    private fun task(source: String?, url: String? = null, fileBacked: Boolean = false) =
        TaskItem(uid = "t", name = "t", source = source, sourceUrl = url, fileBacked = fileBacked)

    @Test
    fun `une origine connue donne sa lettre et son nom, sa page seulement en http ou https`() {
        assertEquals(
            TaskSourceBadge("M", "Gmail", "https://mail.google.com/x", "/api/links/favicon?host=mail.google.com"),
            TaskSources.of(task("gmail", "https://mail.google.com/x")),
        )
        assertEquals(TaskSourceBadge("C", "MCP", null), TaskSources.of(task("mcp", "javascript:alert(1)")))
    }

    @Test
    fun `l'icône du site passe par le serveur, sans icône hors adresse web`() {
        assertEquals("/api/links/favicon?host=blog.exemple.org", TaskSources.of(task("link", "https://Blog.Exemple.org/a?b=1"))?.faviconPath)
        assertNull(TaskSources.of(task("telegram"))?.faviconPath)
    }

    @Test
    fun `pas de badge pour une tâche web, une origine inconnue ou une tâche de TODO md`() {
        assertNull(TaskSources.of(task(null)))
        assertNull(TaskSources.of(task("web")))
        assertNull(TaskSources.of(task("fax")))
        assertNull(TaskSources.of(task("gmail", fileBacked = true)))
    }

    @Test
    fun `seule une idée qui n'est qu'une adresse donne une origine lien`() {
        assertEquals("link" to "https://exemple.org/page", TaskSources.fromIdea(" https://exemple.org/page "))
        assertNull(TaskSources.fromIdea("Lire https://exemple.org/page"))
        assertNull(TaskSources.fromIdea("ftp://exemple.org"))
    }
}
