package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TaskScopeTest {
    private val projects = listOf(ProjectItem("p", "Projet", areaUid = "a"))
    private val tasks = listOf(
        TaskItem(uid = "lien", name = "Lire https://a.io", areaUid = "a"),
        TaskItem(uid = "nu", name = "Payer David", areaUid = "a"),
        TaskItem(uid = "projet", name = "Dans le projet", projectUid = "p"),
        TaskItem(uid = "ailleurs", name = "Autre domaine", areaUid = "b"),
    )

    @Test
    fun `Aujourd'hui et les suggestions ne subissent pas Avec un lien, seulement le domaine`() {
        assertEquals(listOf("lien", "nu", "projet"), TaskScope.planning(tasks, projects, "a").map { it.uid })
        assertEquals(listOf("lien", "nu", "projet", "ailleurs"), TaskScope.planning(tasks, projects, null).map { it.uid })
    }

    @Test
    fun `les listes parcourues appliquent Avec un lien après le domaine`() {
        assertEquals(listOf("lien"), TaskScope.lists(tasks, projects, "a", withLink = true).map { it.uid })
        assertEquals(listOf("lien", "nu", "projet"), TaskScope.lists(tasks, projects, "a", withLink = false).map { it.uid })
    }
}
