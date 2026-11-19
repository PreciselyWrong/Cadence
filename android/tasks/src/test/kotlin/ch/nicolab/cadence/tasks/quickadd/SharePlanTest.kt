package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.model.LinkKind
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskVerbs
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.LocalTime

class SharePlanTest {
    private val text = "https://github.com/jqlang/jq pour les logs"
    private val verbs: TaskVerbs = { kind ->
        when (kind) {
            LinkKind.REPO, LinkKind.TOOL -> "Essayer : %1\$s"
            LinkKind.ARTICLE -> "Lire : %1\$s"
            LinkKind.VIDEO -> "Regarder : %1\$s"
            LinkKind.OTHER -> null
        }
    }

    private fun plan(
        action: ShareAction,
        shared: String = text,
        title: String? = "jq",
        project: String? = "p1",
        taskName: String? = null,
        due: LocalDate? = null,
        time: LocalTime? = null,
    ) = ShareCapture.plan(action, shared, title, listOf("t1", "t1"), project, verbs, taskName, due, time)

    @Test
    fun `la date choisie dans la feuille devient l'échéance et la tâche n'attend plus Quand`() {
        val day = LocalDate.of(2026, 11, 20)
        val dated = plan(ShareAction.TASK, project = null, due = day, time = LocalTime.of(9, 30)) as ShareWrite.Task
        assertEquals(day, dated.draft.dueDate)
        assertEquals("09:30", dated.draft.dueTime)
        assertEquals(false, dated.draft.needsWhen)
        assertEquals(null, (plan(ShareAction.TASK, time = LocalTime.of(9, 30)) as ShareWrite.Task).draft.dueTime)
    }

    @Test
    fun `Inbox garde le texte tel quel`() {
        assertEquals(ShareWrite.Inbox(text), plan(ShareAction.INBOX))
    }

    @Test
    fun `Tâche d'une adresse de dépôt s'appelle Essayer, garde l'adresse et attend Quand sans projet`() {
        assertEquals(
            ShareWrite.Task(
                text,
                TaskDraft(
                    name = "Essayer : jqlang/jq",
                    note = "https://github.com/jqlang/jq\n\npour les logs",
                    projectUid = "p1",
                    tagUids = listOf("t1"),
                    needsWhen = false,
                    source = "link",
                    sourceUrl = "https://github.com/jqlang/jq",
                ),
            ),
            plan(ShareAction.TASK),
        )
        val unfiled = plan(ShareAction.TASK, project = null) as ShareWrite.Task
        assertEquals(true, unfiled.draft.needsWhen)
    }

    @Test
    fun `le nom saisi dans la feuille remplace le nom suggéré, sans titre ni mots`() {
        assertEquals("Mon nom", (plan(ShareAction.TASK, taskName = " Mon nom ") as ShareWrite.Task).draft.name)
        assertEquals("Essayer : jqlang/jq", (plan(ShareAction.TASK, title = null, taskName = "  ") as ShareWrite.Task).draft.name)
    }

    @Test
    fun `Projet fait une page avec adresse, titre de la page, note et projet, sans étiquettes ni source`() {
        assertEquals(
            ShareWrite.Page(text, "https://github.com/jqlang/jq", "jq", "pour les logs", "p1"),
            plan(ShareAction.LINK),
        )
    }

    @Test
    fun `Projet sans adresse ou sans projet retombe sur l'Inbox`() {
        assertEquals(ShareWrite.Inbox("Une idée"), plan(ShareAction.LINK, shared = "Une idée"))
        assertEquals(ShareWrite.Inbox(text), plan(ShareAction.LINK, project = null))
    }

    @Test
    fun `Note prend le titre de la page, puis les mots, et écrit l'adresse puis le reste`() {
        assertEquals(ShareWrite.Note(text, "jq", "https://github.com/jqlang/jq\n\npour les logs"), plan(ShareAction.NOTE))
        assertEquals(
            ShareWrite.Note(text, "pour les logs", "https://github.com/jqlang/jq\n\npour les logs"),
            plan(ShareAction.NOTE, title = null),
        )
        assertEquals(
            ShareWrite.Note("https://a.io/x", "a.io", "https://a.io/x"),
            plan(ShareAction.NOTE, shared = "https://a.io/x", title = null),
        )
    }

    @Test
    fun `Note sans adresse retombe sur l'Inbox`() {
        assertEquals(ShareWrite.Inbox("Une idée"), plan(ShareAction.NOTE, shared = "Une idée"))
    }
}
