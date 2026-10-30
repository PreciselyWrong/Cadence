package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.TaskItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodayWidgetLayoutTest {
    private fun task(n: Int) = TaskItem(uid = "t$n", name = "Tâche $n")

    private fun selection(overdue: Int, tasks: Int, total: Int = overdue + tasks) = TodaySelection(
        total = total,
        overdueTotal = overdue,
        overdue = List(overdue) { task(it) },
        tasks = List(tasks) { task(100 + it) },
        events = emptyList(),
    )

    private val medium = TodayTextSizes.of(TodayTextSize.M)

    @Test
    fun `everything fits so there is no footer`() {
        val fit = TodayWidgetLayout.fit(selection(overdue = 1, tasks = 2), capacity = 6)
        assertEquals(1, fit.overdue.size)
        assertEquals(2, fit.tasks.size)
        assertEquals(0, fit.overflow)
    }

    @Test
    fun `rows that do not fit leave one line for the footer and are counted`() {
        val fit = TodayWidgetLayout.fit(selection(overdue = 4, tasks = 4), capacity = 6)
        assertEquals(5, fit.overdue.size + fit.tasks.size)
        assertEquals(3, fit.overflow)
    }

    @Test
    fun `overdue rows come first when the room is short`() {
        val fit = TodayWidgetLayout.fit(selection(overdue = 4, tasks = 4), capacity = 3)
        assertEquals(2, fit.overdue.size)
        assertEquals(0, fit.tasks.size)
        assertEquals(6, fit.overflow)
    }

    @Test
    fun `tasks cut by the row setting still show in the footer count`() {
        val fit = TodayWidgetLayout.fit(selection(overdue = 0, tasks = 3, total = 9), capacity = 12)
        assertEquals(3, fit.tasks.size)
        assertEquals(6, fit.overflow)
    }

    @Test
    fun `a taller widget holds more rows and habits take room`() {
        val small = TodayWidgetLayout.rowCapacity(180f, medium, habitsShown = false, overdueLabelShown = false)
        val tall = TodayWidgetLayout.rowCapacity(360f, medium, habitsShown = false, overdueLabelShown = false)
        val withHabits = TodayWidgetLayout.rowCapacity(360f, medium, habitsShown = true, overdueLabelShown = false)
        assertTrue(tall > small)
        assertTrue(withHabits < tall)
        assertTrue(TodayWidgetLayout.rowCapacity(10f, medium, habitsShown = true, overdueLabelShown = true) >= 1)
    }
}
