package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProjectHierarchyTest {
    private val projects = listOf(
        ProjectItem("maison", "Maison"),
        ProjectItem("cuisine", "Cuisine", parentProjectUid = "maison"),
        ProjectItem("four", "Four", parentProjectUid = "cuisine"),
        ProjectItem("atelier", "Atelier", parentProjectUid = "maison"),
        ProjectItem("autre", "Autre"),
    )

    @Test
    fun `ancestors list the parents root first`() {
        assertEquals(listOf("maison", "cuisine"), ProjectHierarchy.ancestors(projects, "four").map { it.uid })
        assertEquals(listOf("maison"), ProjectHierarchy.ancestors(projects, "atelier").map { it.uid })
        assertEquals(emptyList<String>(), ProjectHierarchy.ancestors(projects, "maison").map { it.uid })
        assertEquals(emptyList<String>(), ProjectHierarchy.ancestors(projects, "inconnu").map { it.uid })
    }

    @Test
    fun `a missing parent or a loop stops the climb`() {
        val broken = listOf(
            ProjectItem("a", "A", parentProjectUid = "ghost"),
            ProjectItem("b", "B", parentProjectUid = "c"),
            ProjectItem("c", "C", parentProjectUid = "b"),
        )
        assertEquals(emptyList<String>(), ProjectHierarchy.ancestors(broken, "a").map { it.uid })
        assertEquals(listOf("c"), ProjectHierarchy.ancestors(broken, "b").map { it.uid })
    }

    @Test
    fun `children are the direct sub-projects by name with their open tasks only`() {
        val tasks = listOf(
            TaskItem("t1", "T1", projectUid = "cuisine"),
            TaskItem("t2", "T2", projectUid = "cuisine"),
            TaskItem("t3", "T3", projectUid = "cuisine", status = TaskStatus.DONE),
            TaskItem("t4", "T4", projectUid = "four"),
            TaskItem("t5", "T5", projectUid = "maison"),
        )
        val children = ProjectHierarchy.children(projects, "maison", tasks)
        assertEquals(listOf("Atelier" to 0, "Cuisine" to 2), children.map { it.project.name to it.openCount })
        assertEquals(emptyList<SubProject>(), ProjectHierarchy.children(projects, "autre", tasks))
    }

    @Test
    fun `descendants cover every depth and survive a loop`() {
        assertEquals(setOf("cuisine", "four", "atelier"), ProjectHierarchy.descendants(projects, "maison"))
        assertEquals(emptySet<String>(), ProjectHierarchy.descendants(projects, "autre"))
        val loop = listOf(ProjectItem("b", "B", parentProjectUid = "c"), ProjectItem("c", "C", parentProjectUid = "b"))
        assertEquals(setOf("c"), ProjectHierarchy.descendants(loop, "b"))
    }

    @Test
    fun `a project moves under an unrelated project or to the top level`() {
        assertTrue(ProjectHierarchy.canMove(projects, "four", "autre"))
        assertTrue(ProjectHierarchy.canMove(projects, "four", "maison"))
        assertTrue(ProjectHierarchy.canMove(projects, "four", null))
        assertTrue(ProjectHierarchy.canMove(projects, "maison", "autre"))
    }

    @Test
    fun `a project cannot move under itself, a sub-project or an unknown project`() {
        assertFalse(ProjectHierarchy.canMove(projects, "maison", "maison"))
        assertFalse(ProjectHierarchy.canMove(projects, "maison", "cuisine"))
        assertFalse(ProjectHierarchy.canMove(projects, "maison", "four"))
        assertFalse(ProjectHierarchy.canMove(projects, "cuisine", "ghost"))
        assertFalse(ProjectHierarchy.canMove(projects, "ghost", null))
    }

    @Test
    fun `parent candidates leave out the project and its sub-projects`() {
        assertEquals(listOf("Atelier", "Autre", "Maison"), ProjectHierarchy.parentCandidates(projects, "cuisine").map { it.name }.filter { it != "Four" && it != "Cuisine" })
        assertEquals(listOf("Autre"), ProjectHierarchy.parentCandidates(projects, "maison").map { it.name })
    }
}
