package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LinkTriageTest {
    private val today = LocalDate.of(2026, 11, 1)
    private val link = LinkItem(uid = "l1", url = "https://github.com/a/b", title = "a/b", kind = LinkKind.REPO)

    private fun steps(decision: LinkDecision, projectUid: String? = null, item: LinkItem = link) =
        LinkTriage.steps(decision, "e1", item, today, projectUid, "Tester : a/b")

    @Test
    fun `garder marque le lien gardé et traite l'idée, sans tâche`() {
        assertEquals(
            listOf(TriageStep.SetStatus("l1", LinkStatus.KEPT), TriageStep.ProcessInbox("e1")),
            steps(LinkDecision.KEEP),
        )
    }

    @Test
    fun `à tester crée la tâche Tester dans le projet choisi, marque testé et traite l'idée`() {
        val result = steps(LinkDecision.TEST, projectUid = "p1", item = link.copy(note = "voir le CLI"))
        val task = (result[0] as TriageStep.CreateTask).draft
        assertEquals("Tester : a/b", task.name)
        assertEquals("p1", task.projectUid)
        assertEquals("https://github.com/a/b\n\nvoir le CLI", task.note)
        assertEquals(listOf(TriageStep.SetStatus("l1", LinkStatus.TESTED), TriageStep.ProcessInbox("e1")), result.drop(1))
    }

    @Test
    fun `à tester sans projet laisse la tâche sans projet`() {
        val task = (steps(LinkDecision.TEST)[0] as TriageStep.CreateTask).draft
        assertEquals(null, task.projectUid)
        assertEquals("https://github.com/a/b", task.note)
    }

    @Test
    fun `plus tard met de côté avec une revue dans trente jours`() {
        assertEquals(
            listOf(
                TriageStep.SetStatus("l1", LinkStatus.PARKED),
                TriageStep.SetReviewDate("l1", LocalDate.of(2026, 12, 1)),
                TriageStep.ProcessInbox("e1"),
            ),
            steps(LinkDecision.LATER),
        )
    }

    @Test
    fun `jeter marque jeté et traite l'idée`() {
        assertEquals(
            listOf(TriageStep.SetStatus("l1", LinkStatus.DROPPED), TriageStep.ProcessInbox("e1")),
            steps(LinkDecision.DROP),
        )
    }

    @Test
    fun `toute décision traite l'idée en dernier`() {
        LinkDecision.entries.forEach { decision ->
            assertEquals(TriageStep.ProcessInbox("e1"), steps(decision).last(), decision.name)
            assertEquals(1, steps(decision).count { it is TriageStep.ProcessInbox }, decision.name)
        }
    }

    @Test
    fun `run écrit chaque étape dans l'ordre`() = runBlocking {
        val calls = mutableListOf<String>()
        val sink = object : TriageSink {
            override suspend fun createTask(draft: TaskDraft) { calls += "task:${draft.name}" }
            override suspend fun setLinkStatus(uid: String, status: LinkStatus) { calls += "status:$uid:${status.wire}" }
            override suspend fun setReviewDate(uid: String, date: LocalDate) { calls += "review:$uid:$date" }
            override suspend fun processInboxItem(uid: String) { calls += "inbox:$uid" }
        }
        LinkTriage.run(steps(LinkDecision.TEST), sink)
        LinkTriage.run(steps(LinkDecision.LATER), sink)
        assertEquals(
            listOf(
                "task:Tester : a/b", "status:l1:tested", "inbox:e1",
                "status:l1:parked", "review:l1:2026-12-01", "inbox:e1",
            ),
            calls,
        )
    }

    private fun entry(uid: String, content: String, day: Int) =
        InboxEntry(uid, content, "added", Instant.parse("2026-10-%02dT10:00:00Z".format(day)))

    private val entries = listOf(
        entry("e3", "https://c.io/z", 3),
        entry("e0", "juste une idée", 1),
        entry("e2", "https://b.io/y", 2),
        entry("e1", "https://a.io/x", 1),
    )
    private val links = listOf(
        LinkItem("la", "https://a.io/x"),
        LinkItem("lb", "https://b.io/y"),
        LinkItem("lc", "https://c.io/z"),
    )

    private fun order(skipped: List<String> = emptyList(), from: List<InboxEntry> = entries) =
        LinkTriage.queue(from, links, skipped).map { it.entry.uid }

    @Test
    fun `la file ne garde que les idées avec lien, la plus ancienne d'abord`() {
        assertEquals(listOf("e1", "e2", "e3"), order())
        assertEquals(listOf("la", "lb", "lc"), LinkTriage.queue(entries, links).map { it.link.uid })
    }

    @Test
    fun `passer envoie l'idée au bout de la file, dans l'ordre des passages`() {
        val once = LinkTriage.skip(emptyList(), "e1")
        assertEquals(listOf("e2", "e3", "e1"), order(once))
        val twice = LinkTriage.skip(once, "e2")
        assertEquals(listOf("e3", "e1", "e2"), order(twice))
        assertEquals(listOf("e2", "e1"), LinkTriage.skip(twice, "e1"))
    }

    @Test
    fun `décider retire l'idée de la file et la suivante prend sa place`() {
        val skipped = listOf("e1")
        assertEquals("e2", order(skipped).first())
        val afterE2 = entries.filterNot { it.uid == "e2" }
        assertEquals(listOf("e3", "e1"), order(skipped, afterE2))
        val afterE3 = afterE2.filterNot { it.uid == "e3" }
        assertEquals(listOf("e1"), order(skipped, afterE3))
        assertTrue(order(skipped, afterE3.filterNot { it.uid == "e1" }).isEmpty())
    }

    @Test
    fun `les idées passées qui ont quitté l'Inbox sont oubliées`() {
        assertEquals(listOf("e2"), LinkTriage.pruneSkipped(listOf("gone", "e2"), entries.map { it.uid }.toSet()))
    }

    @Test
    fun `l'avancement compte les liens restants sur le total de départ`() {
        assertEquals(1, TriageProgress(total = 5, remaining = 5).position)
        assertEquals(3, TriageProgress(total = 5, remaining = 3).position)
        assertEquals(5, TriageProgress(total = 5, remaining = 1).position)
        assertEquals(1, TriageProgress(total = 0, remaining = 0).position)
    }

    @Test
    fun `une étiquette se coche et se décoche sans toucher aux autres`() {
        assertEquals(listOf("a", "b"), LinkTriage.toggleTag(listOf("a"), "b"))
        assertEquals(listOf("a"), LinkTriage.toggleTag(listOf("a", "b"), "b"))
    }
}
