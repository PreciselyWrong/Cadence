package ch.nicolab.cadence.tasks.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SubtasksTest {
    private val all = listOf(TaskItem(uid = "a", name = "A"), TaskItem(uid = "b", name = "B"), TaskItem(uid = "c", name = "C"))

    @Test
    fun `une sous-tâche en attente de suppression disparaît de la liste, les autres restent`() {
        assertEquals(listOf("a", "c"), Subtasks.visible(all, setOf("b")).map { it.uid })
        assertEquals(all, Subtasks.visible(all, emptySet()))
    }

    @Test
    fun `un nouveau nom est rogné, et un nom vide ou blanc ne renomme rien`() {
        assertEquals("Acheter des œufs", Subtasks.cleanName("  Acheter des œufs "))
        assertNull(Subtasks.cleanName("   "))
        assertNull(Subtasks.cleanName(""))
    }
}
