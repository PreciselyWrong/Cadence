package ch.nicolab.cadence.tasks.review

import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class QuickReviewTest {
    private fun inbox(uid: String) = ReviewInboxItem(uid, "Idée $uid", Instant.parse("2026-10-01T00:00:00Z"))
    private fun task(uid: String, touched: String, reviewed: String? = null, due: Boolean = false) =
        ReviewTask(uid = uid, name = "Tâche $uid", reviewDue = due, lastActivityAt = Instant.parse(touched), reviewedAt = reviewed?.let(Instant::parse))
    private fun project(uid: String) = ReviewProject(uid, "Projet $uid", listOf(ProjectReason.QUIET), 1, null)

    @Test
    fun `what needs a look comes first, in the order of a review`() {
        val session = QuickReview.build(
            inbox = listOf(inbox("i1")),
            pushed = listOf(task("t1", "2026-10-01T00:00:00Z")),
            projects = listOf(project("p1")),
            later = listOf(task("l1", "2026-10-30T00:00:00Z"), task("l2", "2026-10-01T00:00:00Z", due = true)),
            stale = listOf(task("s1", "2026-05-01T00:00:00Z")),
        )
        assertEquals(listOf("inbox:i1", "t1", "project:p1", "l2", "s1", "l1"), session.map { it.key })
        assertEquals(ReviewStep.LATER, (session[3] as QuickEntry.Task).step)
    }

    @Test
    fun `the rest is parked ideas looked at longest ago`() {
        val session = QuickReview.build(
            later = listOf(
                task("recent", "2026-10-30T00:00:00Z", "2026-10-30T00:00:00Z"),
                task("never-new", "2026-10-20T00:00:00Z"),
                task("old-review", "2026-10-25T00:00:00Z", "2026-06-01T00:00:00Z"),
                task("never-old", "2026-03-01T00:00:00Z"),
            ),
        )
        assertEquals(listOf("never-old", "never-new", "old-review", "recent"), session.map { it.key })
    }

    @Test
    fun `a session stays short and shows a task once`() {
        val session = QuickReview.build(
            pushed = listOf(task("same", "2026-10-01T00:00:00Z")),
            stale = listOf(task("same", "2026-01-01T00:00:00Z")),
            later = (0 until 30).map { task("l$it", "2026-10-01T00:00:00Z") },
        )
        assertEquals(10, session.size)
        assertEquals(1, session.count { it.key == "same" })
        assertEquals(ReviewStep.PUSHED, (session[0] as QuickEntry.Task).step)
    }

    @Test
    fun `three places stay for parked ideas when much needs a look`() {
        val session = QuickReview.build(
            inbox = (0 until 12).map { inbox("i$it") },
            later = (1..5).map { task("l$it", "2026-10-0${it}T00:00:00Z") },
        )
        assertEquals((0 until 7).map { "inbox:i$it" } + listOf("l1", "l2", "l3"), session.map { it.key })
    }

    @Test
    fun `what was skipped earlier in the visit stays out`() {
        val session = QuickReview.build(inbox = listOf(inbox("i1"), inbox("i2")), exclude = setOf("inbox:i1"))
        assertEquals(listOf("inbox:i2"), session.map { it.key })
    }

    @Test
    fun `progress counts what is decided or skipped, never the backlog`() {
        val entries = QuickReview.build(inbox = listOf(inbox("a"), inbox("b"), inbox("c")))
        val view = QuickReview.view(entries, skipped = listOf("inbox:a"), pending = { it.key != "inbox:b" })
        assertEquals("inbox:c", view.current?.key)
        assertEquals(3, view.position)
        assertEquals(3, view.total)
        val last = QuickReview.view(entries, skipped = listOf("inbox:a", "inbox:c"), pending = { true })
        assertEquals("inbox:b", last.current?.key)
        val done = QuickReview.view(entries, skipped = listOf("inbox:a", "inbox:c"), pending = { it.key != "inbox:b" })
        assertNull(done.current)
        assertEquals(3, done.total)
    }
}
