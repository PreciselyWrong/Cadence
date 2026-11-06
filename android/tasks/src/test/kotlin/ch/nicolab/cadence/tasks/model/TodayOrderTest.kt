package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TodayOrderTest {
    private fun task(uid: String, rank: Int? = null) =
        TaskItem(uid = uid, name = uid, extras = rank?.let { mapOf("today_order" to it.toString()) } ?: emptyMap())

    @Test
    fun whatWasPlacedByHandComesFirstInThatOrder() {
        val ordered = TodayOrder.apply(listOf(task("libre"), task("b", 1), task("a", 0)))
        assertEquals(listOf("a", "b", "libre"), ordered.map { it.uid })
    }

    @Test
    fun aTaskMovesOneRankAndStopsAtTheEdges() {
        assertEquals(listOf("b", "a", "c"), TodayOrder.moved(listOf("a", "b", "c"), "b", -1))
        assertEquals(listOf("a", "c", "b"), TodayOrder.moved(listOf("a", "b", "c"), "b", 1))
        assertEquals(listOf("a", "b"), TodayOrder.moved(listOf("a", "b"), "a", -1))
        assertEquals(listOf("a", "b"), TodayOrder.moved(listOf("a", "b"), "z", 1))
    }

    @Test
    fun onlyTheRanksThatChangeAreWritten() {
        assertEquals(listOf("b" to 0, "a" to 1), TodayOrder.changes(listOf(task("b", 1), task("a", 0), task("c", 2))))
    }
}
