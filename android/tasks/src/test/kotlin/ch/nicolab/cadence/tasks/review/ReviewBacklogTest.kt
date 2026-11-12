package ch.nicolab.cadence.tasks.review

import ch.nicolab.cadence.tasks.model.Decision
import ch.nicolab.cadence.tasks.model.DecisionContext
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.ReviewDecisions
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReviewBacklogTest {
    private fun served(uid: String, touched: String, project: String? = null, due: Boolean = false) =
        ReviewTask(uid = uid, name = "Tâche $uid", projectName = project, reviewDue = due, lastActivityAt = Instant.parse(touched))

    private val local = mapOf(
        "a" to TaskItem("a", "Tâche a", projectUid = "p1", someday = true),
        "b" to TaskItem("b", "Tâche b", projectUid = "p2", someday = true),
        "c" to TaskItem("c", "Tâche c", projectUid = "p1", someday = true, tagUids = listOf("t1")),
        "d" to TaskItem("d", "Tâche d", someday = true),
        "e" to TaskItem("e", "Tâche e", areaUid = "z1", someday = true),
    )
    private val items = listOf(
        served("a", "2026-09-01T00:00:00Z", "Maison"),
        served("b", "2026-10-20T00:00:00Z", "Vélo"),
        served("c", "2026-10-01T00:00:00Z", "Maison"),
        served("d", "2026-10-30T00:00:00Z"),
        served("e", "2026-08-01T00:00:00Z"),
    )
    private val names = BacklogNames(projects = mapOf("p1" to "Maison", "p2" to "Vélo"), areas = mapOf("z1" to "Perso"), tags = mapOf("t1" to "lecture"))

    @Test
    fun `parked tasks are grouped by project, most recently touched first, no project last`() {
        val groups = ReviewBacklog.groups(items, local, names)
        assertEquals(listOf("Vélo", "Maison", "Perso", null), groups.map { it.name })
        assertEquals(listOf("c", "a"), groups[1].items.map { it.uid })
        assertEquals(listOf(BacklogGroup.Kind.PROJECT, BacklogGroup.Kind.PROJECT, BacklogGroup.Kind.AREA, BacklogGroup.Kind.NONE), groups.map { it.kind })
        assertEquals(listOf("d"), groups.last().items.map { it.uid })
    }

    @Test
    fun `a task whose review date came comes first in its group`() {
        val due = items.map { if (it.uid == "a") it.copy(reviewDue = true) else it }
        assertEquals(listOf("a", "c"), ReviewBacklog.groups(due, local, names).first { it.name == "Maison" }.items.map { it.uid })
    }

    @Test
    fun `a task the phone does not have yet is grouped by the project name the server gave`() {
        val groups = ReviewBacklog.groups(listOf(served("x", "2026-10-01T00:00:00Z", "Atelier")), emptyMap(), names)
        assertEquals(listOf("Atelier"), groups.map { it.name })
    }

    @Test
    fun `the filter matches title, project, tags and link title, accents and case aside`() {
        val links = mapOf("b" to LinkItem(uid = "l1", url = "https://github.com/x/y", title = "Impeccable"))
        assertEquals(listOf("c"), ReviewBacklog.groups(items, local, names, query = "LECTURE").flatMap { it.items }.map { it.uid })
        assertEquals(listOf("c", "a"), ReviewBacklog.groups(items, local, names, query = "maison").flatMap { it.items }.map { it.uid })
        assertEquals(listOf("b"), ReviewBacklog.groups(items, local, names, query = "impecc", linkTitles = links.mapValues { it.value.displayTitle }).flatMap { it.items }.map { it.uid })
        assertEquals(listOf("e"), ReviewBacklog.groups(items, local, names, query = "perso").flatMap { it.items }.map { it.uid })
        assertTrue(ReviewBacklog.groups(items, local, names, query = "rien").isEmpty())
    }

    @Test
    fun `the link of a row is the one written in its title, else a note that is only a link`() {
        assertEquals("https://github.com/pbakaus/impeccable", ReviewBacklog.linkText("https://github.com/pbakaus/impeccable", null))
        assertEquals("Lire https://a.example/x plus tard", ReviewBacklog.linkText("Lire https://a.example/x plus tard", "note"))
        assertEquals("https://b.example/y", ReviewBacklog.linkText("Lire l'article", " https://b.example/y "))
        assertNull(ReviewBacklog.linkText("Lire l'article", "Voir https://b.example/y et le reste"))
        assertNull(ReviewBacklog.linkText("Acheter du pain", null))
    }

    @Test
    fun `a task row takes the link the server found in that task, else the same page`() {
        val own = LinkItem(uid = "l1", url = "https://github.com/pbakaus/impeccable", sourceType = "task", sourceUid = "a")
        val other = LinkItem(uid = "l2", url = "https://github.com/pbakaus/impeccable/", sourceType = "inbox_item", sourceUid = "i1")
        assertEquals("l1", ReviewBacklog.linkFor(listOf(other, own), "task", "a", "https://github.com/pbakaus/impeccable")?.uid)
        assertEquals("l2", ReviewBacklog.linkFor(listOf(other), "task", "a", "https://github.com/pbakaus/impeccable")?.uid)
        assertNull(ReviewBacklog.linkFor(listOf(own), "task", "a", "Acheter du pain"))
    }

    @Test
    fun `one at a time keeps the list order and sends skipped tasks to the end, in skip order`() {
        val order = ReviewBacklog.groups(items, local, names).flatMap { it.items }.map { it.uid }
        assertEquals(listOf("b", "c", "a", "e", "d"), order)
        assertEquals(listOf("c", "e", "d", "a", "b"), ReviewBacklog.queue(order, skipped = listOf("a", "b")))
        assertEquals(listOf("b", "c", "a", "e", "d"), ReviewBacklog.queue(order, skipped = listOf("gone")))
    }

    @Test
    fun `a short list opens every group, a long one only the most recent`() {
        val groups = ReviewBacklog.groups(items, local, names)
        assertEquals(groups.map { it.key }.toSet(), ReviewBacklog.defaultOpen(groups, longAfter = 5))
        assertEquals(setOf(groups.first().key), ReviewBacklog.defaultOpen(groups, longAfter = 4))
    }

    private val ctx = DecisionContext(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 10, 26), ZoneId.of("Europe/Zurich"))

    @Test
    fun `today on a parked task also takes it out of later, so it can reach today`() {
        val parked = TaskItem("a", "a", someday = true)
        assertEquals(false, ReviewDecisions.change(Decision.Today, parked, ctx).later)
        assertNull(ReviewDecisions.change(Decision.Today, TaskItem("b", "b"), ctx).later)
    }

    @Test
    fun `undo puts back what the decision changed and nothing else`() {
        val parked = TaskItem("a", "a", someday = true, reviewOn = LocalDate.of(2026, 10, 1))
        assertEquals(
            TaskChange(inView = false, clearWeek = true, clearMonth = true, reviewOn = LocalDate.of(2026, 10, 1), later = true, clearDue = true),
            ReviewBacklog.undo(Decision.Today, parked, ctx.zone),
        )
        assertEquals(
            TaskChange(inView = false, clearWeek = true, clearMonth = true, reviewOn = LocalDate.of(2026, 10, 1), later = true),
            ReviewBacklog.undo(Decision.ReviewIn30Days, parked, ctx.zone),
        )
        assertEquals(TaskChange(status = TaskStatus.NOT_STARTED), ReviewBacklog.undo(Decision.Drop, parked, ctx.zone))
    }
}
