package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.TaskItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TodayTaskMetaTest {
    private val projects = mapOf("p" to "🌵Perso")
    private val tags = mapOf("a" to "d1", "b" to "e1")

    @Test
    fun `projet puis étiquettes, séparés par un point`() {
        val task = TaskItem(uid = "t", name = "t", projectUid = "p", tagUids = listOf("a", "b"))
        assertEquals("🌵Perso · #d1 #e1", taskMeta(task, projects, tags))
    }

    @Test
    fun `sans projet ni étiquette connus, rien`() {
        assertNull(taskMeta(TaskItem(uid = "t", name = "t", tagUids = listOf("inconnue")), projects, tags))
        assertEquals("#d1", taskMeta(TaskItem(uid = "t", name = "t", tagUids = listOf("a")), projects, tags))
    }
}
