package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AgendaInteractionsTest {

    private val zone = ZoneId.of("Europe/Zurich")
    private val day = LocalDate.of(2026, 10, 30)

    private fun allDayTask(title: String, done: Boolean = false, recurring: Boolean = false, estimate: Int? = null) =
        AgendaEntry.Task(
            uid = title,
            title = title,
            start = day.atStartOfDay(),
            end = day.plusDays(1).atStartOfDay(),
            allDay = true,
            done = done,
            colorArgb = 0xFF112233.toInt(),
            estimateMinutes = estimate,
            recurring = recurring,
        )

    // --- ligne des journées entières ---

    @Test
    fun `all-day row keeps two entries and counts the rest`() {
        val entries = List(5) { allDayTask("t$it") }
        val cap = capAllDay(entries, expanded = false)
        assertEquals(listOf("t0", "t1"), cap.visible.map { it.title })
        assertEquals(3, cap.hidden)
        assertTrue(cap.overflowing)
    }

    @Test
    fun `all-day row shows everything up to the cap`() {
        val cap = capAllDay(List(2) { allDayTask("t$it") }, expanded = false)
        assertEquals(2, cap.visible.size)
        assertEquals(0, cap.hidden)
        assertFalse(cap.overflowing)
    }

    @Test
    fun `expanding shows every entry but stays collapsible`() {
        val cap = capAllDay(List(5) { allDayTask("t$it") }, expanded = true)
        assertEquals(5, cap.visible.size)
        assertEquals(0, cap.hidden)
        assertTrue(cap.overflowing)
    }

    // --- tâche à heure : durée = estimation ---

    @Test
    fun `a timed task lasts its estimate`() {
        val task = TaskItem(
            uid = "a",
            name = "Appel",
            dueDate = Instant.parse("2026-10-30T20:30:00Z"),
            dueHasTime = true,
            estimatedMinutes = 90,
        )
        val entry = agendaTask(task, null, zone)!!
        assertEquals(LocalDateTime.of(2026, 10, 30, 21, 30), entry.start)
        assertEquals(LocalDateTime.of(2026, 10, 30, 23, 0), entry.end)
        assertEquals(90, entry.estimateMinutes)
    }

    @Test
    fun `a timed task without estimate keeps a point in time`() {
        val task = TaskItem(uid = "a", name = "Appel", dueDate = Instant.parse("2026-10-30T20:30:00Z"), dueHasTime = true)
        val entry = agendaTask(task, null, zone)!!
        assertEquals(entry.start, entry.end)
        assertNull(entry.estimateMinutes)
    }

    @Test
    fun `an all-day task carries its estimate and recurrence`() {
        val task = TaskItem(
            uid = "b", name = "Payer", dueDate = Instant.parse("2026-10-30T21:59:59Z"), dueDay = day,
            estimatedMinutes = 45, recurrenceType = "weekly",
        )
        val entry = agendaTask(task, null, zone)!!
        assertEquals(45, entry.estimateMinutes)
        assertTrue(entry.recurring)
    }

    @Test
    fun `drop block uses the estimate or the default block`() {
        assertEquals(90, dropBlockMinutes(90))
        assertEquals(MIN_BLOCK_MINUTES, dropBlockMinutes(null))
        assertEquals(MIN_BLOCK_MINUTES, dropBlockMinutes(0))
    }

    // --- glisser une tâche de la rangée de journée ---

    @Test
    fun `an open one-off all-day task can be dragged with its estimate`() {
        val item = draggableTaskItem(allDayTask("Payer", estimate = 30))!!
        assertEquals("Payer", item.uid)
        assertEquals(0, item.overdueDays)
        assertEquals(30, item.estimateMinutes)
        assertEquals(0xFF112233.toInt(), item.colorArgb)
    }

    @Test
    fun `done, recurring and non-task entries are not draggable`() {
        assertNull(draggableTaskItem(allDayTask("a", done = true)))
        assertNull(draggableTaskItem(allDayTask("b", recurring = true)))
        val habit = AgendaEntry.Habit("h", "Eau", day.atStartOfDay(), day.plusDays(1).atStartOfDay(), true, false, null)
        assertNull(draggableTaskItem(habit))
    }

    @Test
    fun `tray items carry the task estimate`() {
        val tray = trayItems(listOf(TaskItem(uid = "x", name = "x", estimatedMinutes = 25)), emptyMap(), day)
        assertEquals(25, tray.single().estimateMinutes)
    }

    // --- annulation d'une planification ---

    @Test
    fun `undo of an undated task clears the due date`() {
        val change = restoreSchedule(TaskItem(uid = "a", name = "a"), zone)
        assertTrue(change.clearDue)
    }

    @Test
    fun `undo of a day task restores the day without time`() {
        val task = TaskItem(uid = "a", name = "a", dueDate = Instant.parse("2026-10-28T21:59:59Z"), dueDay = LocalDate.of(2026, 10, 28))
        val change = restoreSchedule(task, zone)
        assertEquals(LocalDate.of(2026, 10, 28), change.dueDate)
        assertNull(change.dueTime)
        assertFalse(change.clearDue)
    }

    @Test
    fun `undo of a timed task restores date and time in device zone`() {
        val task = TaskItem(uid = "a", name = "a", dueDate = Instant.parse("2026-10-28T08:15:00Z"), dueHasTime = true)
        val change = restoreSchedule(task, zone)
        assertEquals(LocalDate.of(2026, 10, 28), change.dueDate)
        assertEquals("09:15", change.dueTime)
    }

    // --- redimensionner un bloc ---

    @Test
    fun `resize snaps the duration to quarter hours`() {
        val hour = 100f
        // 60 min + 0,3 h = 78 min -> 75
        assertEquals(75, resizedMinutes(startMinute = 9 * 60, baseMinutes = 60, deltaPx = 30f, hourHeightPx = hour))
        assertEquals(60, resizedMinutes(9 * 60, 60, deltaPx = 3f, hourHeightPx = hour))
        assertEquals(120, resizedMinutes(9 * 60, 60, deltaPx = 100f, hourHeightPx = hour))
    }

    @Test
    fun `resize never shrinks below the minimum block`() {
        assertEquals(MIN_BLOCK_MINUTES, resizedMinutes(9 * 60, 60, deltaPx = -500f, hourHeightPx = 100f))
    }

    @Test
    fun `resize stops at midnight`() {
        assertEquals(60, resizedMinutes(startMinute = 23 * 60, baseMinutes = 30, deltaPx = 900f, hourHeightPx = 100f))
    }

    // --- bandeau des jours replié au défilement ---

    @Test
    fun `scrolling down past the threshold collapses the strip`() {
        var s = ScrollCollapse()
        s = s.after(-20f, 48f)
        assertFalse(s.collapsed)
        s = s.after(-40f, 48f)
        assertTrue(s.collapsed)
    }

    @Test
    fun `scrolling back up past the threshold expands it`() {
        var s = ScrollCollapse(collapsed = true)
        s = s.after(30f, 48f)
        assertTrue(s.collapsed)
        s = s.after(30f, 48f)
        assertFalse(s.collapsed)
    }

    @Test
    fun `a direction change restarts the travel`() {
        var s = ScrollCollapse()
        s = s.after(-40f, 48f)
        s = s.after(10f, 48f)
        s = s.after(-40f, 48f)
        assertFalse(s.collapsed)
    }

    // --- grille du mois ---

    @Test
    fun `month grid stays within its share of the screen`() {
        val screen = 900f
        val header = 20f
        val cell = monthCellDp(rows = 6, screenDp = screen, headerDp = header)
        assertTrue(cell * 6 + header <= screen * MONTH_GRID_SCREEN_FRACTION)
        assertTrue(cell >= 36f)
    }

    @Test
    fun `month cell is capped on tall screens and floored on short ones`() {
        assertEquals(44f, monthCellDp(rows = 5, screenDp = 1400f, headerDp = 20f))
        assertEquals(36f, monthCellDp(rows = 6, screenDp = 500f, headerDp = 20f))
    }
}
