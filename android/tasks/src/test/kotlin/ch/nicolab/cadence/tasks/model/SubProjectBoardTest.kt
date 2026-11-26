package ch.nicolab.cadence.tasks.model

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SubProjectBoardTest {
    private val now = Instant.parse("2026-11-26T12:00:00Z")

    private fun project(uid: String, name: String = uid, parent: String? = null, status: String = "in_progress") =
        ProjectItem(uid = uid, name = name, status = status, parentProjectUid = parent)

    private fun task(
        uid: String,
        projectUid: String,
        section: String? = null,
        position: Int? = null,
        status: Int = TaskStatus.NOT_STARTED,
        parentTaskUid: String? = null,
    ) = TaskItem(
        uid = uid,
        name = uid,
        projectUid = projectUid,
        sourceSection = section,
        sourcePosition = position,
        status = status,
        parentTaskUid = parentTaskUid,
    )

    private fun handoff(blockers: String? = null, updatedAt: String? = null) =
        ProjectHandoff(nextAction = "Livrer", blockers = blockers, updatedAt = updatedAt?.let(Instant::parse))

    @Test
    fun healthIsNullWithoutCurrentState() {
        assertNull(SubProjectBoard.health(null, now))
    }

    @Test
    fun aBlockerWinsOverFreshness() {
        assertEquals(
            ProjectHealth.BLOCKED,
            SubProjectBoard.health(handoff(blockers = "API en panne", updatedAt = "2026-11-20T12:00:00Z"), now),
        )
    }

    @Test
    fun aStateOlderThanFourteenDaysIsStaleAndYoungerIsOk() {
        assertEquals(ProjectHealth.STALE, SubProjectBoard.health(handoff(updatedAt = "2026-11-01T12:00:00Z"), now))
        assertEquals(ProjectHealth.OK, SubProjectBoard.health(handoff(updatedAt = "2026-11-12T12:00:00Z"), now))
        assertEquals(ProjectHealth.OK, SubProjectBoard.health(handoff(), now))
    }

    @Test
    fun staleAgeIsCountedInWholeDays() {
        assertEquals(25, SubProjectBoard.ageDays(handoff(updatedAt = "2026-11-01T12:00:00Z"), now))
        assertNull(SubProjectBoard.ageDays(handoff(), now))
    }

    @Test
    fun columnsAreTheParentThenInProgressSubProjectsByNameThatHaveOpenTasks() {
        val projects = listOf(
            project("p", "Parent"),
            project("b", "Bravo", parent = "p"),
            project("a", "alpha", parent = "p"),
            project("idle", "Idle", parent = "p"),
            project("paused", "Paused", parent = "p", status = "paused"),
            project("deep", "Deep", parent = "a"),
        )
        val tasks = listOf(
            task("t1", "b"),
            task("t2", "a"),
            task("t3", "p"),
            task("t4", "paused"),
            task("t5", "idle", status = TaskStatus.DONE),
            task("t6", "deep"),
            task("t7", "a", parentTaskUid = "t2"),
        )
        val columns = SubProjectBoard.columns(projects.first(), projects, tasks)
        assertEquals(listOf("p", "a", "b"), columns.map { it.project.uid })
        assertEquals(listOf(true, false, false), columns.map { it.isParent })
        assertEquals(listOf("t2"), columns[1].tasks.map { it.uid })
    }

    @Test
    fun theParentColumnIsOmittedWithoutOpenTasks() {
        val projects = listOf(project("p"), project("a", parent = "p"))
        val columns = SubProjectBoard.columns(projects.first(), projects, listOf(task("t1", "a")))
        assertEquals(listOf("a"), columns.map { it.project.uid })
    }

    @Test
    fun sectionsAreNowNextIdeasThenOthersInArrivalOrderThenLooseTasks() {
        val groups = SubProjectBoard.groupBySection(
            listOf(
                task("a", "p", "Next"),
                task("b", "p"),
                task("c", "p", "Now"),
                task("d", "p", "Bugs"),
                task("e", "p", "next"),
                task("f", "p", "Ideas"),
                task("g", "p", "Archive"),
            ),
        )
        assertEquals(
            listOf("Now" to listOf("c"), "Next" to listOf("a", "e"), "Ideas" to listOf("f"), "Bugs" to listOf("d"), "Archive" to listOf("g"), null to listOf("b")),
            groups.map { it.label to it.tasks.map(TaskItem::uid) },
        )
    }

    @Test
    fun insideASectionTheFileOrderComesFirstThenCadenceOnlyTasksInArrivalOrder() {
        val groups = SubProjectBoard.groupBySection(
            listOf(
                task("third", "p", "Next", 7),
                task("cadence1", "p", "Next"),
                task("first", "p", "Next", 2),
                task("cadence2", "p", "Next"),
                task("second", "p", "Next", 5),
            ),
        )
        assertEquals(listOf("first", "second", "third", "cadence1", "cadence2"), groups.single().tasks.map { it.uid })
    }

    @Test
    fun aColumnWithoutAnyNamedSectionShowsNoOthersTitle() {
        val groups = SubProjectBoard.groupBySection(listOf(task("a", "p"), task("b", "p")))
        assertEquals(listOf<String?>(null), groups.map { it.label })
        assertEquals(false, groups.single().showTitle)
        val mixed = SubProjectBoard.groupBySection(listOf(task("a", "p"), task("b", "p", "Now")))
        assertEquals(listOf(true, true), mixed.map { it.showTitle })
    }

    @Test
    fun aSectionFoldsAfterEightCards() {
        val ten = (1..10).map { task("t$it", "p", "Now") }
        val folded = SubProjectBoard.fold(ten, expanded = false)
        assertEquals(8, folded.shown.size)
        assertEquals(2, folded.hidden)
        val open = SubProjectBoard.fold(ten, expanded = true)
        assertEquals(10, open.shown.size)
        assertEquals(0, open.hidden)
        val exactly = SubProjectBoard.fold(ten.take(8), expanded = false)
        assertEquals(8, exactly.shown.size)
        assertEquals(0, exactly.hidden)
    }
}
