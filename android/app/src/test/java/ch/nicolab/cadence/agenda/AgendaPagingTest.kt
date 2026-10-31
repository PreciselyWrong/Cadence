package ch.nicolab.cadence.agenda

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AgendaPagingTest {

    private val width = 1000f

    @Test
    fun `dragging left past the threshold goes to the next period`() {
        assertEquals(1, pageSwipeDirection(offsetPx = -300f, velocityPx = 0f, widthPx = width))
    }

    @Test
    fun `dragging right past the threshold goes to the previous period`() {
        assertEquals(-1, pageSwipeDirection(offsetPx = 300f, velocityPx = 0f, widthPx = width))
    }

    @Test
    fun `a short slow drag stays on the current period`() {
        assertEquals(0, pageSwipeDirection(offsetPx = -80f, velocityPx = -200f, widthPx = width))
        assertEquals(0, pageSwipeDirection(offsetPx = 0f, velocityPx = 0f, widthPx = width))
    }

    @Test
    fun `a fast fling in the drag direction counts even when short`() {
        assertEquals(1, pageSwipeDirection(offsetPx = -90f, velocityPx = -2500f, widthPx = width))
        assertEquals(-1, pageSwipeDirection(offsetPx = 90f, velocityPx = 2500f, widthPx = width))
    }

    @Test
    fun `a fling against the drag direction is ignored`() {
        assertEquals(0, pageSwipeDirection(offsetPx = -90f, velocityPx = 2500f, widthPx = width))
    }

    @Test
    fun `a swipe left then right returns to the same day in every view`() {
        val day = LocalDate.of(2026, 10, 15)
        AgendaMode.entries.forEach { mode ->
            val next = stepDate(mode, day, pageSwipeDirection(-400f, 0f, width), weekends = true)
            val back = stepDate(mode, next, pageSwipeDirection(400f, 0f, width), weekends = true)
            assertEquals(day, back, "mode $mode")
        }
    }

    @Test
    fun `month view steps a whole month and list view its window`() {
        val day = LocalDate.of(2026, 1, 31)
        assertEquals(LocalDate.of(2026, 2, 28), stepDate(AgendaMode.MONTH, day, 1, weekends = true))
        assertEquals(day.plusDays(AGENDA_LIST_DAYS.toLong()), stepDate(AgendaMode.LIST, day, 1, weekends = true))
    }
}
