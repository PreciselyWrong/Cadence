package ch.nicolab.cadence.tasks.quickadd

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class QuickAddSeriesTest {
    private val start = 1_000_000L
    private val minute = 60_000L

    @Test
    fun `a first task in a project starts a series that carries the project`() {
        val series = QuickAddSeries().saved("p-site", start)
        assertEquals(1, series.added)
        assertEquals("p-site", series.carriedProject(start + minute))
    }

    @Test
    fun `tasks in the same project add up`() {
        val series = QuickAddSeries().saved("p-site", start).saved("p-site", start + minute)
        assertEquals(2, series.added)
    }

    @Test
    fun `a task in another project starts a new count`() {
        val series = QuickAddSeries().saved("p-site", start).saved("p-home", start + minute)
        assertEquals(1, series.added)
        assertEquals("p-home", series.carriedProject(start + minute))
    }

    @Test
    fun `a task without a project carries nothing`() {
        val series = QuickAddSeries().saved("p-site", start).saved(null, start + minute)
        assertNull(series.carriedProject(start + minute))
        assertEquals(1, series.added)
    }

    @Test
    fun `removing the chip ends the carry but the next task still counts`() {
        val series = QuickAddSeries().saved("p-site", start).projectRemoved(start + 1)
        assertNull(series.carriedProject(start + 2))
        assertEquals(2, series.saved(null, start + 3).added)
    }

    @Test
    fun `two minutes without activity end the series`() {
        val series = QuickAddSeries().saved("p-site", start)
        assertTrue(series.isActive(start + 2 * minute - 1))
        assertFalse(series.isActive(start + 2 * minute))
        assertNull(series.carriedProject(start + 2 * minute))
        assertEquals(1, series.saved("p-site", start + 3 * minute).added)
    }

    @Test
    fun `typing keeps the series alive`() {
        val series = QuickAddSeries().saved("p-site", start).touched(start + 110_000L)
        assertEquals("p-site", series.carriedProject(start + 200_000L))
    }

    @Test
    fun `an expired series ignores typing`() {
        val series = QuickAddSeries().saved("p-site", start)
        assertEquals(series, series.touched(start + 5 * minute))
    }

    @Test
    fun `undoing the last task lowers the count and keeps the project`() {
        val series = QuickAddSeries().saved("p-site", start).saved("p-site", start + 1).undone(start + 2)
        assertEquals(1, series.added)
        assertEquals("p-site", series.carriedProject(start + 3))
        assertEquals(0, series.undone(start + 4).added)
        assertEquals("p-site", series.undone(start + 4).carriedProject(start + 5))
    }

    @Test
    fun `a carried project is dropped from an empty fresh series`() {
        assertNull(QuickAddSeries().carriedProject(start))
    }
}
