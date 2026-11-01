package ch.nicolab.cadence.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HabitOrderTest {
    private val group = listOf(OrderSlot("x", 0), OrderSlot("y", 1), OrderSlot("z", 2))

    @Test
    fun `monter echange avec le precedent et ne touche que les rangs qui changent`() {
        assertEquals(mapOf("y" to 0, "x" to 1), HabitOrder.movePatches(group, "y", -1))
    }

    @Test
    fun `descendre echange avec le suivant`() {
        assertEquals(mapOf("z" to 1, "y" to 2), HabitOrder.movePatches(group, "y", 1))
    }

    @Test
    fun `le premier ne monte pas et le dernier ne descend pas`() {
        assertEquals(emptyMap<String, Int>(), HabitOrder.movePatches(group, "x", -1))
        assertEquals(emptyMap<String, Int>(), HabitOrder.movePatches(group, "z", 1))
    }

    @Test
    fun `des rangs egaux se separent au deplacement`() {
        val tied = listOf(OrderSlot("a", 0), OrderSlot("b", 0), OrderSlot("c", 5))
        assertEquals(mapOf("a" to 1, "c" to 2), HabitOrder.movePatches(tied, "b", -1))
    }

    @Test
    fun `la copie se place apres le dernier rang du groupe`() {
        assertEquals(3, HabitOrder.nextSortOrder(group))
        assertEquals(0, HabitOrder.nextSortOrder(emptyList()))
    }
}
