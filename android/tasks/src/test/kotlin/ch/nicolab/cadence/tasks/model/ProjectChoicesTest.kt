package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ProjectChoicesTest {
    private val projects = listOf(
        ProjectItem("active", "Actif", status = "in_progress"),
        ProjectItem("stash", "En pause", status = "paused"),
        ProjectItem("done", "Déménagement 2025", status = "done"),
        ProjectItem("dropped", "Abandonné", status = "cancelled"),
        ProjectItem("archived", "Archivé", status = "archived"),
        ProjectItem("unknown", "Sans statut"),
    )

    @Test
    fun `closed projects are not offered to file a task`() {
        assertEquals(listOf("active", "stash", "unknown"), ProjectChoices.forTask(projects, null).map { it.uid })
    }

    @Test
    fun `the task's own closed project stays listed so it is still marked`() {
        assertEquals(listOf("active", "stash", "done", "unknown"), ProjectChoices.forTask(projects, "done").map { it.uid })
    }
}
