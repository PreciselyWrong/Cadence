package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.model.LinkDraft
import ch.nicolab.cadence.tasks.model.TaskDraft
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SharePlanTest {
    private val text = "https://github.com/jqlang/jq pour les logs"

    private fun plan(action: ShareAction, shared: String = text, title: String? = "jq") =
        ShareCapture.plan(action, shared, title, listOf("t1", "t1"), listOf("dev"), "p1")

    @Test
    fun `Inbox garde le texte tel quel`() {
        assertEquals(ShareWrite.Inbox(text), plan(ShareAction.INBOX))
    }

    @Test
    fun `Tâche suit la règle de nom, l'adresse et le reste en note, avec étiquettes et projet`() {
        assertEquals(
            ShareWrite.Task(text, TaskDraft(name = "jq", note = "https://github.com/jqlang/jq\n\npour les logs", projectUid = "p1", tagUids = listOf("t1"))),
            plan(ShareAction.TASK),
        )
        assertEquals("pour les logs", (plan(ShareAction.TASK, title = null) as ShareWrite.Task).draft.name)
    }

    @Test
    fun `Liens envoie l'adresse, le titre, les noms d'étiquettes et le projet, sans source`() {
        assertEquals(
            ShareWrite.Link(text, LinkDraft("https://github.com/jqlang/jq", "jq", "pour les logs", listOf("dev"), "p1")),
            plan(ShareAction.LINK),
        )
    }

    @Test
    fun `Liens sans adresse retombe sur l'Inbox`() {
        assertEquals(ShareWrite.Inbox("Une idée"), plan(ShareAction.LINK, shared = "Une idée"))
    }
}
