package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Outliner d'un projet : retrait = parent, rang = `order` du groupe de frères, comme le web. */
class OutlineTest {
    private fun task(uid: String, parent: String? = null, order: Int? = null, recurring: Boolean = false, status: Int = TaskStatus.NOT_STARTED) =
        TaskItem(
            uid = uid,
            name = uid,
            parentTaskUid = parent,
            projectUid = "p",
            status = status,
            recurrenceType = if (recurring) "daily" else null,
            extras = order?.let { mapOf("order" to it.toString()) }.orEmpty(),
        )

    private val a = task("a")
    private val b = task("b")
    private val c = task("c")
    private val b1 = task("b1", parent = "b", order = 0)
    private val b2 = task("b2", parent = "b", order = 1)

    private val tree = Outline.tree(listOf(a, b, c), listOf(a, b, c, b1, b2))

    private fun shape(nodes: List<OutlineNode>) = Outline.rows(nodes).map { "${"  ".repeat(it.depth)}${it.task.uid}" }

    @Test
    fun `les sous-tâches ouvertes suivent leur parent, rangées par order`() {
        val reversed = Outline.tree(listOf(a, b), listOf(a, b, task("b1", "b", 1), task("b2", "b", 0), task("b3", "b", status = TaskStatus.DONE)))
        assertEquals(listOf("a", "b", "  b2", "  b1"), shape(reversed))
        assertTrue(Outline.rows(reversed)[1].hasChildren)
    }

    @Test
    fun `sans order, l'ordre reçu est gardé, les tâches rangées passent devant`() {
        val mixed = Outline.tree(listOf(a, b, task("c", order = 0)), listOf(a, b))
        assertEquals(listOf("c", "a", "b"), shape(mixed))
    }

    @Test
    fun `décaler fait de la tâche la dernière sous-tâche de la précédente`() {
        val after = Outline.indent(tree, "c")!!
        assertEquals(listOf("a", "b", "  b1", "  b2", "  c"), shape(after))
        assertEquals(listOf(OutlineMove("c", "b", 2, parentChanged = true)), Outline.changes(tree, after))
    }

    @Test
    fun `la première tâche, une sous-tâche, une tâche qui a des sous-tâches ou une série ne se décalent pas`() {
        assertNull(Outline.indent(tree, "a"))
        assertNull(Outline.indent(tree, "b1"))
        val withParent = Outline.tree(listOf(a, b), listOf(a, b, b1))
        assertNull(Outline.indent(withParent, "b"))
        val series = Outline.tree(listOf(a, task("r", recurring = true)), emptyList())
        assertNull(Outline.indent(series, "r"))
        val underSeries = Outline.tree(listOf(task("r", recurring = true), a), emptyList())
        assertNull(Outline.indent(underSeries, "a"))
        assertFalse(Outline.canIndent(tree, "a"))
        assertTrue(Outline.canIndent(tree, "c"))
    }

    @Test
    fun `ressortir place la sous-tâche juste après son parent, le groupe quitté garde ses rangs`() {
        val after = Outline.outdent(tree, "b1")!!
        assertEquals(listOf("a", "b", "  b2", "b1", "c"), shape(after))
        assertEquals(
            listOf(
                OutlineMove("a", null, 0, parentChanged = false),
                OutlineMove("b", null, 1, parentChanged = false),
                OutlineMove("b1", null, 2, parentChanged = true),
                OutlineMove("c", null, 3, parentChanged = false),
            ),
            Outline.changes(tree, after),
        )
        assertNull(Outline.outdent(tree, "a"))
    }

    @Test
    fun `monter et descendre restent dans le groupe de frères`() {
        val up = Outline.move(tree, "b2", up = true)!!
        assertEquals(listOf("a", "b", "  b2", "  b1", "c"), shape(up))
        assertEquals(listOf(OutlineMove("b2", "b", 0, false), OutlineMove("b1", "b", 1, false)), Outline.changes(tree, up))
        assertNull(Outline.move(tree, "b1", up = true))
        assertNull(Outline.move(tree, "c", up = false))
        assertEquals(listOf("b", "  b1", "  b2", "a", "c"), shape(Outline.move(tree, "a", up = false)!!))
    }

    @Test
    fun `ajouter une tâche sœur la place juste après, au même retrait`() {
        val slot = Outline.siblingSlot(tree, "b1")
        assertEquals("b", slot.parentUid)
        assertEquals(1, slot.order)
        assertEquals(listOf(OutlineMove("b2", "b", 2, false)), slot.shifts)

        val top = Outline.siblingSlot(tree, "a")
        assertNull(top.parentUid)
        assertEquals(1, top.order)
        assertEquals(listOf(OutlineMove("a", null, 0, false), OutlineMove("b", null, 2, false), OutlineMove("c", null, 3, false)), top.shifts)
    }

    @Test
    fun `une opération sans effet n'écrit rien`() {
        assertEquals(emptyList<OutlineMove>(), Outline.changes(tree, tree))
    }

    @Test
    fun `un rang écrit devient la valeur order de la tâche`() {
        assertEquals(TaskChange(order = 2, parentTaskUid = "b"), OutlineMove("c", "b", 2, parentChanged = true).change)
        assertEquals(TaskChange(order = 0, clearParent = true), OutlineMove("b1", null, 0, parentChanged = true).change)
        assertEquals(TaskChange(order = 1), OutlineMove("b2", "b", 1, parentChanged = false).change)
    }
}
