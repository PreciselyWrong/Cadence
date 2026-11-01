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
    fun `active objectives sort by nearest target date and the others fold apart`() {
        val goals = listOf(
            GoalItem("paused", "A", status = "paused"),
            GoalItem("late", "B", targetDate = java.time.LocalDate.of(2027, 1, 1)),
            GoalItem("soon", "C", targetDate = java.time.LocalDate.of(2026, 12, 1)),
            GoalItem("open", "D"),
            GoalItem("won", "E", status = "achieved"),
        )
        val overview = Goals.overview(goals, emptyList(), emptyList())
        assertEquals(listOf("soon", "late", "open"), overview.objectives.map { it.goal.uid })
        assertEquals(listOf("paused", "won"), overview.otherObjectives.map { it.goal.uid })
    }

    @Test
    fun `the next step is the open task with the nearest due day, then the oldest, then the first by name`() {
        val day = java.time.LocalDate.of(2026, 11, 3)
        val tasks = listOf(
            task("closed", "k", TaskStatus.DONE).copy(dueDay = day.minusDays(5)),
            task("sub", "k", parent = "x").copy(dueDay = day.minusDays(4)),
            task("Zèbre", "o"),
            task("Écrire", "o"),
            task("due", "k").copy(dueDay = day),
            task("other", "elsewhere").copy(dueDay = day.minusDays(9)),
        )
        assertEquals("due", Goals.nextStep(setOf("o", "k"), tasks)?.uid)
        assertEquals("Écrire", Goals.nextStep(setOf("o"), tasks)?.uid)
        assertNull(Goals.nextStep(setOf("nothing"), tasks))

        val created = listOf(
            task("étape 10", "s").copy(extras = mapOf("created_at" to "2026-10-02T08:00:00Z")),
            task("étape 4", "s").copy(extras = mapOf("created_at" to "2026-10-01T08:00:00Z")),
            task("pas encore envoyée", "s"),
        )
        assertEquals("étape 4", Goals.nextStep(setOf("s"), created)?.uid)

        val goals = listOf(GoalItem("o", "Objectif"), GoalItem("k", "Résultat", parentGoalUid = "o"))
        assertEquals("due", Goals.overview(goals, tasks, emptyList()).objectives.single().nextStep?.uid)
    }

    @Test
    fun `achieved and dropped wishes leave the groups, paused ones stay, accents sort with their letter`() {
        val goals = listOf(
            GoalItem("z", "Zanzibar", bucket = GoalBucket.DO),
            GoalItem("e", "Écrire un livre", bucket = GoalBucket.DO),
            GoalItem("a", "Apprendre", bucket = GoalBucket.DO, status = "paused"),
            GoalItem("won", "Marathon", bucket = GoalBucket.DO, status = "achieved"),
            GoalItem("gone", "Bateau", bucket = GoalBucket.HAVE, status = "dropped"),
        )
        val overview = Goals.overview(goals, listOf(task("t", "e")), emptyList())
        assertEquals(listOf("a", "e", "z"), overview.wishes.getValue(GoalBucket.DO).map { it.uid })
        assertEquals(listOf("gone", "won"), overview.doneWishes.map { it.uid })
        assertEquals(3, overview.openWishCount)
        assertEquals("t", overview.wishSteps["e"]?.uid)
    }

    @Test
    fun `filtering ignores case and accents and keeps an objective for a matching key result`() {
        val goals = listOf(
            GoalItem("o1", "Courir un semi"),
            GoalItem("k1", "10 km sous 55 min", parentGoalUid = "o1"),
            GoalItem("k2", "Inscription", parentGoalUid = "o1"),
            GoalItem("o2", "Finances", why = "Dormir sereinement"),
            GoalItem("k3", "Budget", parentGoalUid = "o2"),
            GoalItem("w1", "Écrire un livre", bucket = GoalBucket.DO),
            GoalItem("w2", "Un chien", bucket = GoalBucket.HAVE),
        )
        val overview = Goals.overview(goals, emptyList(), emptyList())

        val byKeyResult = Goals.filter(overview, "INSCRIPTION")
        assertEquals(listOf("o1"), byKeyResult.objectives.map { it.goal.uid })
        assertEquals(listOf("k2"), byKeyResult.objectives.single().keyResults.map { it.goal.uid })

        val byWhy = Goals.filter(overview, "serein")
        assertEquals(listOf("k3"), byWhy.objectives.single().keyResults.map { it.goal.uid })

        val byWish = Goals.filter(overview, "ecrire")
        assertTrue(byWish.objectives.isEmpty())
        assertEquals(listOf("w1"), byWish.wishes.getValue(GoalBucket.DO).map { it.uid })
        assertTrue(byWish.wishes.getValue(GoalBucket.HAVE).isEmpty())

        assertEquals(overview, Goals.filter(overview, "  "))
    }

    @Test
    fun `unknown horizon falls back to season and bucket to none`() {
        assertEquals(GoalHorizon.SEASON, GoalHorizon.fromWire("décennie"))
        assertEquals(GoalHorizon.QUARTER, GoalHorizon.fromWire("quarter"))
        assertNull(GoalBucket.fromWire(null))
        assertEquals(GoalBucket.BE, GoalBucket.fromWire("be"))
    }
}
