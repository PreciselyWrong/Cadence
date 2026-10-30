package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AgendaDropTest {

    private val day = LocalDate.of(2026, 10, 30)
    private val hour = 100f

    @Test
    fun `y offset snaps to the nearest quarter hour`() {
        assertEquals(LocalDateTime.of(2026, 10, 30, 14, 30), dropDateTime(day, 14.5f * hour, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 14, 15), dropDateTime(day, 14.3f * hour, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 14, 30), dropDateTime(day, 14.4f * hour, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 9, 0), dropDateTime(day, 9.05f * hour, hour))
    }

    @Test
    fun `drop stays inside the day`() {
        assertEquals(LocalDateTime.of(2026, 10, 30, 0, 0), dropDateTime(day, -40f, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 23, 45), dropDateTime(day, 24f * hour + 500f, hour))
        assertEquals(LocalDateTime.of(2026, 10, 30, 23, 45), dropDateTime(day, 23.9f * hour, hour))
    }

    @Test
    fun `target accounts for scroll, gutter and column`() {
        val days = listOf(day, day.plusDays(1), day.plusDays(2))
        // Grille en (10, 200), 320 de large dont 20 de gouttière : colonnes de 100.
        val at = dropTarget(
            x = 10f + 20f + 150f, y = 200f + 30f,
            left = 10f, top = 200f, width = 320f, height = 600f,
            scrollPx = 1000f, hourHeightPx = hour, gutterPx = 20f, days = days,
        )
        assertEquals(LocalDateTime.of(2026, 10, 31, 10, 15), at)
    }

    @Test
    fun `target is null outside the grid or over the gutter`() {
        val days = listOf(day)
        fun at(x: Float, y: Float) = dropTarget(x, y, 0f, 100f, 300f, 400f, 0f, hour, 40f, days)
        assertNull(at(20f, 200f))
        assertNull(at(150f, 50f))
        assertNull(at(150f, 550f))
        assertNull(at(350f, 200f))
        assertEquals(LocalDateTime.of(2026, 10, 30, 1, 0), at(150f, 200f))
    }

    @Test
    fun `drop change sets date and time`() {
        val change = dropChange(LocalDateTime.of(2026, 10, 30, 9, 5))
        assertEquals(LocalDate.of(2026, 10, 30), change.dueDate)
        assertEquals("09:05", change.dueTime)
    }

    private fun task(
        uid: String,
        due: LocalDate? = null,
        status: Int = TaskStatus.NOT_STARTED,
        recurrence: String? = null,
        hasTime: Boolean = false,
        name: String = uid,
    ) = TaskItem(
        uid = uid,
        name = name,
        status = status,
        dueDate = due?.atStartOfDay()?.toInstant(ZoneOffset.UTC),
        dueHasTime = hasTime,
        dueDay = due,
        recurrenceType = recurrence,
    )

    @Test
    fun `tray holds open undated and overdue tasks, overdue first`() {
        val tasks = listOf(
            task("undated-b"),
            task("overdue-old", due = day.minusDays(5)),
            task("today", due = day),
            task("future", due = day.plusDays(2)),
            task("done", status = TaskStatus.DONE),
            task("overdue-yesterday", due = day.minusDays(1)),
            task("recurring", recurrence = "daily"),
            task("undated-a"),
        )
        val tray = trayItems(tasks, emptyMap(), day)
        assertEquals(
            listOf("overdue-old", "overdue-yesterday", "undated-a", "undated-b"),
            tray.map { it.uid },
        )
        assertEquals(listOf(5, 1, 0, 0), tray.map { it.overdueDays })
    }

    @Test
    fun `tray takes the project colour`() {
        val tray = trayItems(listOf(task("t").copy(projectUid = "p")), mapOf("p" to 0xFF112233.toInt()), day)
        assertEquals(0xFF112233.toInt(), tray.single().colorArgb)
    }

    @Test
    fun `timed overdue task is still in the tray`() {
        val tray = trayItems(listOf(task("t", due = day.minusDays(1), hasTime = true)), emptyMap(), day)
        assertEquals(1, tray.single().overdueDays)
    }
}
