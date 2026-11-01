package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GoalsTest {
    private fun task(uid: String, goal: String?, status: Int = TaskStatus.NOT_STARTED, parent: String? = null) =
        TaskItem(uid = uid, name = uid, status = status, goalUid = goal, parentTaskUid = parent)

    private fun project(uid: String, goal: String?, status: String = "in_progress") =
        ProjectItem(uid, uid, status = status, goalUid = goal)

    @Test
    fun `progress counts done and archived tasks, done projects, and ignores cancelled and subtasks`() {
        val tasks = listOf(
            task("a", "g", TaskStatus.DONE),
            task("b", "g", TaskStatus.ARCHIVED),
            task("c", "g"),
            task("d", "g", TaskStatus.CANCELLED),
            task("e", "g", TaskStatus.DONE, parent = "c"),
            task("f", "other", TaskStatus.DONE),
        )
        val projects = listOf(project("p1", "g", "done"), project("p2", "g"), project("p3", "g", "cancelled"))

        val progress = Goals.progress(setOf("g"), tasks, projects)

        assertEquals(GoalProgress(done = 3, total = 5), progress)
        assertEquals(60, progress.percent)
    }

    @Test
    fun `nothing linked gives no percentage`() {
        val progress = Goals.progress(setOf("g"), emptyList(), emptyList())
        assertNull(progress.percent)
        assertEquals(0f, progress.fraction)
    }

    @Test
    fun `an objective counts its own items and those of its key results`() {
        val goals = listOf(
            GoalItem("o", "Objectif"),
            GoalItem("k1", "Résultat B", parentGoalUid = "o"),
            GoalItem("k2", "Résultat A", parentGoalUid = "o"),
        )
        val tasks = listOf(task("t1", "o", TaskStatus.DONE), task("t2", "k1", TaskStatus.DONE), task("t3", "k1"), task("t4", "k2"))

        val overview = Goals.overview(goals, tasks, emptyList())

        val objective = overview.objectives.single()
        assertEquals(GoalProgress(2, 4), objective.progress)
        assertEquals(listOf("k2", "k1"), objective.keyResults.map { it.goal.uid })
        assertEquals(GoalProgress(1, 2), objective.keyResults.last().progress)
        assertEquals(GoalProgress(0, 1), objective.keyResults.first().progress)
    }

    @Test
    fun `wishes stay out of the objectives and group as have, be, do`() {
        val goals = listOf(
            GoalItem("o", "Objectif"),
            GoalItem("w1", "Voyager", bucket = GoalBucket.DO),
            GoalItem("w2", "Maison", bucket = GoalBucket.HAVE),
            GoalItem("w3", "Patient", bucket = GoalBucket.BE),
            GoalItem("w4", "Apprendre", bucket = GoalBucket.DO),
        )

        val overview = Goals.overview(goals, emptyList(), emptyList())

        assertEquals(listOf("o"), overview.objectives.map { it.goal.uid })
        assertEquals(listOf(GoalBucket.HAVE, GoalBucket.BE, GoalBucket.DO), overview.wishes.keys.toList())
        assertEquals(listOf("w4", "w1"), overview.wishes.getValue(GoalBucket.DO).map { it.uid })
        assertTrue(!overview.isEmpty)
        assertTrue(Goals.overview(emptyList(), emptyList(), emptyList()).isEmpty)
    }

    @Test
    fun `a wish counts the tasks created from it, without cancelled ones or subtasks`() {
        val goals = listOf(GoalItem("w", "Voyager", bucket = GoalBucket.DO), GoalItem("v", "Maison", bucket = GoalBucket.HAVE))
        val tasks = listOf(
            task("a", "w"),
            task("b", "w", TaskStatus.DONE),
            task("c", "w", TaskStatus.CANCELLED),
            task("d", "w", parent = "a"),
            task("e", "other"),
        )

        val overview = Goals.overview(goals, tasks, emptyList())

        assertEquals(2, overview.linkedTasks["w"])
        assertEquals(0, overview.linkedTasks["v"] ?: 0)
    }

    @Test
    fun `a goal status reads its wire value and an unknown one stays active`() {
        assertEquals(GoalStatus.ACHIEVED, GoalStatus.fromWire("achieved"))
        assertEquals(GoalStatus.DROPPED, GoalStatus.fromWire("dropped"))
        assertEquals(GoalStatus.ACTIVE, GoalStatus.fromWire(null))
        assertEquals(GoalStatus.ACTIVE, GoalStatus.fromWire("weird"))
    }

    @Test
    fun `active objectives come first then the nearest target date`() {
        val goals = listOf(
            GoalItem("paused", "A", status = "paused"),
            GoalItem("late", "B", targetDate = java.time.LocalDate.of(2027, 1, 1)),
            GoalItem("soon", "C", targetDate = java.time.LocalDate.of(2026, 12, 1)),
            GoalItem("open", "D"),
        )
        assertEquals(listOf("soon", "late", "open", "paused"), Goals.overview(goals, emptyList(), emptyList()).objectives.map { it.goal.uid })
    }

    @Test
    fun `unknown horizon falls back to season and bucket to none`() {
        assertEquals(GoalHorizon.SEASON, GoalHorizon.fromWire("décennie"))
        assertEquals(GoalHorizon.QUARTER, GoalHorizon.fromWire("quarter"))
        assertNull(GoalBucket.fromWire(null))
        assertEquals(GoalBucket.BE, GoalBucket.fromWire("be"))
    }
}
