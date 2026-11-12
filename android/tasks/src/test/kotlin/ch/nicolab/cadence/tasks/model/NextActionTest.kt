package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class NextActionTest {
    private val today = LocalDate.of(2026, 11, 1)
    private val now: Instant = Instant.parse("2026-11-01T09:00:00Z")
    private val week = LocalDate.of(2026, 10, 26)

    private fun task(uid: String, project: String? = null, status: Int = TaskStatus.NOT_STARTED, inView: Boolean = false, someday: Boolean = false) =
        TaskItem(
            uid = uid, name = uid, status = status, projectUid = project,
            inViewAt = if (inView) Instant.parse("2026-10-30T08:00:00Z") else null, someday = someday,
        )

    @Test
    fun `a designated task is shown only while it is open and in its project`() {
        val project = ProjectItem("p", "Projet", nextTaskUid = "t")
        assertEquals("t", NextAction.of(project, listOf(task("t", "p")))?.uid)
        assertNull(NextAction.of(project, listOf(task("t", "p", status = TaskStatus.DONE))))
        assertNull(NextAction.of(project, listOf(task("t", "autre"))))
        assertNull(NextAction.of(ProjectItem("p", "Projet"), listOf(task("t", "p"))))
    }

    @Test
    fun `only an open top-level project task can be designated`() {
        assertTrue(NextAction.canDesignate(task("t", "p")))
        assertFalse(NextAction.canDesignate(task("t")))
        assertFalse(NextAction.canDesignate(task("t", "p", status = TaskStatus.CANCELLED)))
        assertFalse(NextAction.canDesignate(task("t", "p").copy(parentTaskUid = "x")))
        assertTrue(NextAction.canDesignate(task("t", "p").copy(fileBacked = true)))
    }

    @Test
    fun `suggestions put the designated action first and drop the other tasks of that project`() {
        val tasks = listOf(
            task("autre", "p", inView = true),
            task("choisie", "p"),
            task("libre", "q", inView = true),
            task("sans-projet", inView = true),
        )

        val result = TaskViews.suggestions(tasks, today, now, week, mapOf("p" to "choisie")).map { it.uid }

        assertEquals(listOf("choisie", "libre", "sans-projet").sorted(), result.sorted())
        assertEquals("choisie", result.first())
        assertFalse("autre" in result)
    }

    @Test
    fun `a stale designation does not hide the rest of the project`() {
        val tasks = listOf(task("autre", "p", inView = true), task("close", "p", status = TaskStatus.DONE))
        assertEquals(listOf("autre"), TaskViews.suggestions(tasks, today, now, week, mapOf("p" to "close")).map { it.uid })
    }

    @Test
    fun `without any designation suggestions are unchanged`() {
        val tasks = listOf(task("a", "p", inView = true), task("b", "p", inView = true))
        assertEquals(2, TaskViews.suggestions(tasks, today, now, week).size)
    }

    @Test
    fun `a project card carries the designated action name`() {
        val projects = listOf(ProjectItem("p", "Projet", nextTaskUid = "t2"))
        val tasks = listOf(task("t1", "p"), task("t2", "p"))
        val card = TaskOverviews.projectGroups(projects, emptyList(), tasks, now).single().projects.single()
        assertEquals("t2", card.nextActionName)
        assertNull(TaskOverviews.projectGroups(listOf(ProjectItem("p", "Projet")), emptyList(), tasks, now).single().projects.single().nextActionName)
    }

    @Test
    fun `byProject keeps only projects with a pick`() {
        assertEquals(mapOf("p" to "t"), NextAction.byProject(listOf(ProjectItem("p", "P", nextTaskUid = "t"), ProjectItem("q", "Q"))))
    }
}
