package ch.nicolab.cadence.tasks.planning

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayReorderTest {
    private val day = LocalDate.of(2026, 11, 12)

    @Test
    fun `une tâche prévue se range devant la prochaine tâche prévue`() {
        assertEquals(listOf(ReorderTask(day, "c", "a")), TodayReorder.writes(day, listOf("a", "b", "c"), setOf("a", "b", "c"), "c", 0))
        assertEquals(listOf(ReorderTask(day, "a", null)), TodayReorder.writes(day, listOf("a", "b", "c"), setOf("a", "b", "c"), "a", 2))
    }

    @Test
    fun `une tâche seulement due entre au plan à sa nouvelle place`() {
        assertEquals(listOf(AddTask(day, "d", "b")), TodayReorder.writes(day, listOf("a", "b", "d"), setOf("a", "b"), "d", 1))
        assertEquals(listOf(AddTask(day, "d", null)), TodayReorder.writes(day, listOf("d", "a", "x"), setOf("a"), "d", 2))
    }

    @Test
    fun `rien ne part si la tâche ne bouge pas ou n'est pas dans la liste`() {
        assertTrue(TodayReorder.writes(day, listOf("a", "b"), setOf("a"), "a", 0).isEmpty())
        assertTrue(TodayReorder.writes(day, listOf("a", "b"), setOf("a"), "z", 1).isEmpty())
        assertTrue(TodayReorder.writes(day, listOf("a", "b"), setOf("a"), "a", 5).isEmpty())
    }
}
