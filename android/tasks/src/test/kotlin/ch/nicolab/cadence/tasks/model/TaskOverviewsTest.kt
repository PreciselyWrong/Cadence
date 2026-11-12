package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskOverviewsTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val friday = LocalDate.of(2026, 10, 30)
    private val now: Instant = friday.atTime(12, 0).atZone(zone).toInstant()

    private fun done(uid: String, day: LocalDate, project: String? = null) = TaskItem(
        uid = uid, name = uid, status = TaskStatus.DONE, projectUid = project,
        completedAt = day.atTime(10, 0).atZone(zone).toInstant(),
    )

    private fun open(uid: String, project: String? = null, tags: List<String> = emptyList(), due: LocalDate? = null) =
        TaskItem(uid = uid, name = uid, projectUid = project, tagUids = tags, dueDay = due, dueDate = due?.atTime(23, 59)?.atZone(zone)?.toInstant())

    @Test
    fun `projects group by area with progress and next task, orphans last`() {
        val areas = listOf(AreaItem("home", "Maison"), AreaItem("work", "Travail"), AreaItem("empty", "Vide"))
        val projects = listOf(
            ProjectItem("p1", "Rénovation", areaUid = "home"),
            ProjectItem("p2", "Cadence", areaUid = "work"),
            ProjectItem("p3", "Sans domaine"),
        )
        val tasks = listOf(
            done("a", friday, "p1"), done("b", friday, "p1"), open("c", "p1", due = friday.plusDays(2)), open("d", "p1", due = friday.plusDays(1)),
            open("e", "p2"),
        )
        val groups = TaskOverviews.projectGroups(projects, areas, tasks, now)
        assertEquals(listOf("Maison", "Travail", null), groups.map { it.area?.name })
        val renovation = groups[0].projects.single()
        assertEquals(2, renovation.openCount)
        assertEquals(2, renovation.doneCount)
        assertEquals(0.5f, renovation.progress)
        assertEquals("d", renovation.nextTaskName)
        assertEquals(0f, groups[2].projects.single().progress)
        assertNull(groups[2].projects.single().nextTaskName)
    }

    @Test
    fun `projects split into active, stash and closed with counts`() {
        val areas = listOf(AreaItem("work", "Travail"))
        val projects = listOf(
            ProjectItem("a", "Alpha", status = "in_progress", areaUid = "work"),
            ProjectItem("b", "Bravo", status = null),
            ProjectItem("c", "Charlie", status = "paused", areaUid = "work"),
            ProjectItem("d", "Delta", status = "done"),
            ProjectItem("e", "Echo", status = "cancelled"),
            ProjectItem("f", "Foxtrot", status = "archived"),
            ProjectItem("g", "Golf", status = "waiting"),
        )
        val overview = TaskOverviews.projectOverview(projects, areas, emptyList(), now)
        assertEquals(listOf("Alpha", "Bravo", "Golf"), overview.active.flatMap { g -> g.projects.map { it.project.name } })
        assertEquals(listOf("Charlie"), overview.stash.flatMap { g -> g.projects.map { it.project.name } })
        assertEquals(listOf("Delta", "Echo", "Foxtrot"), overview.closed.flatMap { g -> g.projects.map { it.project.name } })
        assertEquals(3, overview.activeCount)
        assertEquals(1, overview.stashCount)
        assertEquals(3, overview.closedCount)
    }

    @Test
    fun `project status groups follow the status values`() {
        assertEquals(ProjectStatus.IN_PROGRESS, ProjectStatus.fromWire("in_progress"))
        assertEquals(ProjectStatus.NOT_STARTED, ProjectStatus.fromWire(null))
        assertEquals(ProjectStatus.NOT_STARTED, ProjectStatus.fromWire("inconnu"))
        assertEquals(listOf("not_started", "planned", "in_progress", "waiting", "done", "cancelled", "paused", "archived"), ProjectStatus.entries.map { it.wire })
        assertEquals(setOf(ProjectStatus.DONE, ProjectStatus.CANCELLED, ProjectStatus.ARCHIVED), ProjectStatus.entries.filter { it.isClosed }.toSet())
    }

    @Test
    fun `tags count open tasks and list them by due date`() {
        val tags = listOf(TagItem("t1", "Urgent"), TagItem("t2", "Admin"))
        val tasks = listOf(open("a", tags = listOf("t1")), open("b", tags = listOf("t1", "t2"), due = friday), done("c", friday).copy(tagUids = listOf("t1")))
        assertEquals(listOf("Admin" to 1, "Urgent" to 2), TaskOverviews.tagCards(tags, tasks).map { it.tag.name to it.openCount })
        assertEquals(listOf("b", "a"), TaskOverviews.ofTag(tasks, tags, "t1", now).map { it.uid })
    }

    @Test
    fun `a parent tag counts and lists the tasks of its sub-tags`() {
        val tags = listOf(TagItem("p", "perso"), TagItem("s", "perso/sport"), TagItem("c", "perso/sport/course"), TagItem("o", "perso2"))
        val tasks = listOf(
            open("a", tags = listOf("p")),
            open("b", tags = listOf("s")),
            open("c", tags = listOf("c", "s")),
            open("d", tags = listOf("o")),
        )
        val counts = TaskOverviews.tagCards(tags, tasks).associate { it.tag.name to it.openCount }
        assertEquals(mapOf("perso" to 3, "perso/sport" to 2, "perso/sport/course" to 1, "perso2" to 1), counts)
        assertEquals(setOf("a", "b", "c"), TaskOverviews.ofTag(tasks, tags, "p", now).map { it.uid }.toSet())
        assertEquals(setOf("b", "c"), TaskOverviews.ofTag(tasks, tags, "s", now).map { it.uid }.toSet())
        assertEquals(listOf("c"), TaskOverviews.ofTag(tasks, tags, "c", now).map { it.uid })
    }

    @Test
    fun `completed tasks group by completion day, newest first`() {
        val tasks = listOf(done("old", friday.minusDays(3)), done("a", friday), done("b", friday), open("x"))
        val groups = TaskOverviews.completedByDay(tasks, zone)
        assertEquals(listOf(friday, friday.minusDays(3)), groups.map { it.first })
        assertEquals(2, groups[0].second.size)
    }

    @Test
    fun `task stats count this week from monday, last week, and overdue`() {
        val monday = LocalDate.of(2026, 10, 26)
        val tasks = listOf(
            done("mon", monday), done("fri", friday), done("lastSun", monday.minusDays(1)), done("lastMon", monday.minusDays(7)),
            done("ancient", monday.minusDays(30)),
            open("late", due = friday.minusDays(2)), open("fine", due = friday),
        )
        val stats = TaskOverviews.taskStats(tasks, friday, now, zone)
        assertEquals(TaskStats(doneThisWeek = 2, doneLastWeek = 2, overdue = 1), stats)
    }

    @Test
    fun `week review counts done per day from monday, groups by project and lists overdue oldest first`() {
        val monday = LocalDate.of(2026, 10, 26)
        val tasks = listOf(
            done("a", monday, project = "p1"), done("b", monday, project = "p1"), done("c", friday, project = "p2"),
            done("d", friday), done("lastWeek", monday.minusDays(1), project = "p2"),
            open("late", due = friday.minusDays(1)), open("older", due = friday.minusDays(4)), open("fine", due = friday),
        )

        val review = TaskOverviews.weekReview(tasks, friday, now, zone)

        assertEquals((0L..6L).map { monday.plusDays(it) }, review.donePerDay.map { it.first })
        assertEquals(listOf(2, 0, 0, 0, 2, 0, 0), review.donePerDay.map { it.second })
        assertEquals(listOf("p1" to 2, "p2" to 1, null to 1), review.doneByProject)
        assertEquals(listOf("older", "late"), review.overdue.map { it.uid })
    }
}
