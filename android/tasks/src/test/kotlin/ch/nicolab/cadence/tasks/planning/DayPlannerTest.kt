package ch.nicolab.cadence.tasks.planning

import java.time.DayOfWeek
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DayPlannerTest {
    private val friday = LocalDate.of(2026, 10, 30)
    private val saturday = LocalDate.of(2026, 10, 31)
    private val hours = WorkingHours()

    private fun hm(hour: Int, minute: Int = 0) = hour * 60 + minute

    private fun task(uid: String, minutes: Int? = 30, due: LocalDate? = friday, priority: Int? = null) =
        Candidate(uid, minutes, due, priority)

    @Test
    fun `places tasks first-fit from the start of the day with a buffer between them`() {
        val result = DayPlanner.place(friday, hours, emptyList(), listOf(task("a"), task("b")))
        assertEquals(
            listOf(ProposedBlock("a", hm(9), hm(9, 30)), ProposedBlock("b", hm(9, 45), hm(10, 15))),
            result.blocks,
        )
        assertTrue(result.unplaced.isEmpty())
    }

    @Test
    fun `orders by due date then priority then uid`() {
        val result = DayPlanner.place(
            friday, hours, emptyList(),
            listOf(
                task("later", due = friday.plusDays(1), priority = 2),
                task("low", due = friday, priority = 0),
                task("high", due = friday, priority = 2),
                task("none", due = null, priority = 2),
                task("also-high", due = friday, priority = 2),
            ),
        )
        assertEquals(listOf("also-high", "high", "low", "later", "none"), result.blocks.map { it.uid })
    }

    @Test
    fun `never overlaps a busy block and keeps the buffer on both sides`() {
        val busy = listOf(Slot(hm(9, 45), hm(10, 30)))
        val result = DayPlanner.place(friday, hours, busy, listOf(task("a"), task("b")))
        assertEquals(
            listOf(ProposedBlock("a", hm(9), hm(9, 30)), ProposedBlock("b", hm(10, 45), hm(11, 15))),
            result.blocks,
        )
    }

    @Test
    fun `jumps over a busy block when the gap is too small`() {
        val busy = listOf(Slot(hm(9, 30), hm(10)))
        val result = DayPlanner.place(friday, hours, busy, listOf(task("a", minutes = 60)))
        assertEquals(listOf(ProposedBlock("a", hm(10, 15), hm(11, 15))), result.blocks)
    }

    @Test
    fun `rounds starts up to five minutes`() {
        val busy = listOf(Slot(hm(9), hm(10, 7)))
        val result = DayPlanner.place(friday, hours, busy, listOf(task("a")))
        assertEquals(hm(10, 25), result.blocks.single().start)
    }

    @Test
    fun `never places before notBefore`() {
        val result = DayPlanner.place(friday, hours, emptyList(), listOf(task("a")), notBefore = hm(13, 2))
        assertEquals(hm(13, 5), result.blocks.single().start)
    }

    @Test
    fun `reports tasks that do not fit before the end of the day`() {
        val result = DayPlanner.place(
            friday, hours, emptyList(),
            listOf(task("a", minutes = 10 * 60), task("b", minutes = 60)),
        )
        assertEquals(listOf("b"), result.blocks.map { it.uid })
        assertEquals(listOf("a"), result.unplaced)
    }

    @Test
    fun `a later small task fills an earlier gap`() {
        val busy = listOf(Slot(hm(9, 45), hm(17)))
        val result = DayPlanner.place(
            friday, hours, busy,
            listOf(task("big", minutes = 120), task("small", minutes = 20, due = friday.plusDays(2))),
        )
        assertEquals(listOf("small"), result.blocks.map { it.uid })
        assertEquals(listOf("big"), result.unplaced)
    }

    @Test
    fun `uses the default estimate when none is set`() {
        val result = DayPlanner.place(friday, hours, emptyList(), listOf(task("a", minutes = null), task("b", minutes = 0)))
        assertEquals(30, result.blocks[0].end - result.blocks[0].start)
        assertEquals(30, result.blocks[1].end - result.blocks[1].start)
    }

    @Test
    fun `places nothing on a day off`() {
        val result = DayPlanner.place(saturday, hours, emptyList(), listOf(task("a")))
        assertTrue(result.blocks.isEmpty())
        assertEquals(listOf("a"), result.unplaced)
    }

    @Test
    fun `working days are configurable`() {
        val weekend = WorkingHours(days = setOf(DayOfWeek.SATURDAY))
        assertTrue(weekend.isWorkday(saturday))
        assertFalse(weekend.isWorkday(friday))
    }

    @Test
    fun `available minutes subtract the union of busy blocks clipped to the working window`() {
        val busy = listOf(Slot(hm(8), hm(10)), Slot(hm(9, 30), hm(11)), Slot(hm(17), hm(19)))
        assertEquals(6 * 60, DayPlanner.availableMinutes(friday, hours, busy))
    }

    @Test
    fun `available minutes start from notBefore and vanish on a day off`() {
        assertEquals(5 * 60, DayPlanner.availableMinutes(friday, hours, emptyList(), notBefore = hm(13)))
        assertEquals(0, DayPlanner.availableMinutes(friday, hours, emptyList(), notBefore = hm(19)))
        assertEquals(0, DayPlanner.availableMinutes(saturday, hours, emptyList()))
    }

    @Test
    fun `capacity reports planned versus free and flags overload at 100 percent`() {
        val ok = Capacity(plannedMinutes = 200, availableMinutes = 440)
        assertEquals(240, ok.freeMinutes)
        assertFalse(ok.overloaded)

        val full = Capacity(plannedMinutes = 440, availableMinutes = 440)
        assertEquals(0, full.freeMinutes)
        assertTrue(full.overloaded)

        val over = Capacity(plannedMinutes = 500, availableMinutes = 440)
        assertEquals(0, over.freeMinutes)
        assertTrue(over.overloaded)

        assertFalse(Capacity(0, 0).overloaded)
        assertTrue(Capacity(30, 0).overloaded)
    }

    @Test
    fun `formats durations in plain french`() {
        assertEquals("0 min", formatMinutes(0))
        assertEquals("45 min", formatMinutes(45))
        assertEquals("4 h", formatMinutes(240))
        assertEquals("3 h 20", formatMinutes(200))
    }
}
