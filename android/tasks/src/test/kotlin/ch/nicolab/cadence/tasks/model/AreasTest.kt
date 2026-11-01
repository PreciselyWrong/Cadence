package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AreasTest {
    private val projects = listOf(
        ProjectItem("p1", "Maison", areaUid = "perso"),
        ProjectItem("p2", "Appli", areaUid = "tech"),
        ProjectItem("p3", "Vrac"),
    )
    private val tasks = listOf(
        TaskItem("a", "A", projectUid = "p1"),
        TaskItem("b", "B", projectUid = "p2"),
        TaskItem("c", "C", areaUid = "perso"),
        TaskItem("d", "D", areaUid = "tech", projectUid = "p1"),
        TaskItem("e", "E", projectUid = "p3"),
    )

    @Test
    fun `no filter keeps everything`() {
        assertEquals(tasks, AreaFilter.tasks(tasks, projects, null))
        assertEquals(projects, AreaFilter.projects(projects, null))
    }

    @Test
    fun `a task follows its own area, else its project's`() {
        assertEquals(listOf("a", "c"), AreaFilter.tasks(tasks, projects, "perso").map { it.uid })
        assertEquals(listOf("b", "d"), AreaFilter.tasks(tasks, projects, "tech").map { it.uid })
    }

    @Test
    fun `tag counts and the done list follow the area filter`() {
        val zone = java.time.ZoneOffset.UTC
        val done = java.time.Instant.parse("2026-11-01T08:00:00Z")
        val tagged = listOf(
            TaskItem("a", "A", projectUid = "p1", tagUids = listOf("t")),
            TaskItem("b", "B", projectUid = "p2", tagUids = listOf("t")),
            TaskItem("c", "C", projectUid = "p1", status = TaskStatus.DONE, completedAt = done),
            TaskItem("d", "D", projectUid = "p2", status = TaskStatus.DONE, completedAt = done),
        )
        val perso = AreaFilter.tasks(tagged, projects, "perso")

        assertEquals(1, TaskOverviews.tagCards(listOf(TagItem("t", "t")), perso).single().openCount)
        assertEquals(listOf("c"), TaskOverviews.completedByDay(perso, zone).flatMap { it.second }.map { it.uid })
        assertEquals(2, TaskOverviews.tagCards(listOf(TagItem("t", "t")), AreaFilter.tasks(tagged, projects, null)).single().openCount)
    }

    @Test
    fun `projects filter by area`() {
        assertEquals(listOf("p2"), AreaFilter.projects(projects, "tech").map { it.uid })
    }

    @Test
    fun `suggested areas skip the names already there, whatever the case`() {
        val existing = listOf(AreaItem("1", "perso"), AreaItem("2", " Famille et Social "))
        assertEquals(
            listOf("Business et Argent", "Logistique"),
            AreaSuggestions.missing(existing, listOf("Business et Argent", "Perso", "Famille et Social", "Logistique")),
        )
    }

    @Test
    fun `suggested areas drop repeated names`() {
        assertEquals(listOf("Perso"), AreaSuggestions.missing(emptyList(), listOf("Perso", "perso")))
    }

    @Test
    fun `the filter row needs at least two areas to choose between`() {
        assertEquals(false, AreaFilter.offersChoice(emptyList()))
        assertEquals(false, AreaFilter.offersChoice(listOf(AreaItem("bucket", "Bucket list"))))
        assertEquals(true, AreaFilter.offersChoice(listOf(AreaItem("perso", "Perso"), AreaItem("tech", "Tech"))))
    }

    @Test
    fun `a remembered area is ignored once it is the only one, since the row that would clear it is hidden`() {
        val single = listOf(AreaItem("perso", "Perso"))
        val two = single + AreaItem("tech", "Tech")
        assertEquals(null, AreaFilter.effective("perso", single))
        assertEquals("perso", AreaFilter.effective("perso", two))
        assertEquals(null, AreaFilter.effective("gone", two))
    }
}
