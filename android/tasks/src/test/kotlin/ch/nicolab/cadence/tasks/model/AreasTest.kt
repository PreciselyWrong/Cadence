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
}
