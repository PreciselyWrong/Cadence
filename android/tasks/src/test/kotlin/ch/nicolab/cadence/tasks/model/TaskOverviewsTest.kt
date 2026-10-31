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
    fun `tags count open tasks and list them by due date`() {
        val tags = listOf(TagItem("t1", "Urgent"), TagItem("t2", "Admin"))
        val tasks = listOf(open("a", tags = listOf("t1")), open("b", tags = listOf("t1", "t2"), due = friday), done("c", friday).copy(tagUids = listOf("t1")))
        assertEquals(listOf("Admin" to 1, "Urgent" to 2), TaskOverviews.tagCards(tags, tasks).map { it.tag.name to it.openCount })
        assertEquals(listOf("b", "a"), TaskOverviews.ofTag(tasks, "t1", now).map { it.uid })
    }

    @Test
    fun `completed tasks group by completion day, newest first`() {
        val tasks = listOf(done("old", friday.minusDays(3)), done("a", friday), done("b", friday), open("x"))
        val groups = TaskOverviews.completedByDay(tasks, zone)
        assertEquals(listOf(friday, friday.minusDays(3)), groups.map { it.first })
        assertEquals(2, groups[0].second.size)
    }

    @Test
    fun `week strip starts today and counts tasks per day`() {
        val upcoming = mapOf(friday.plusDays(1) to listOf(open("a"), open("b")), friday.plusDays(9) to listOf(open("far")))
        val strip = TaskOverviews.weekStrip(friday, todayCount = 3, upcoming = upcoming)
        assertEquals(7, strip.size)
        assertEquals(StripDay(friday, 3), strip[0])
        assertEquals(2, strip[1].count)
        assertEquals(0, strip[6].count)
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
