package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskEditsTest {
    private val zone = ZoneId.of("Europe/Paris")
    private val day = LocalDate.of(2026, 10, 28)

    private fun task(
        due: LocalDate? = day,
        time: LocalTime? = null,
        recurring: Boolean = false,
        start: LocalDate? = null,
        startTime: LocalTime? = null,
    ) = TaskItem(
        uid = "t1",
        name = "Payer",
        note = "Réf 12",
        dueDate = due?.let { (time ?: LocalTime.of(23, 59)).atDate(it).atZone(zone).toInstant() },
        dueHasTime = time != null,
        dueDay = due,
        recurrenceType = if (recurring) "weekly" else null,
        startDate = start?.let { (startTime ?: LocalTime.MIDNIGHT).atDate(it).atZone(zone).toInstant() },
        startHasTime = startTime != null,
        startDay = start,
    )

    @Test
    fun `unchanged due is an empty change`() {
        val result = TaskEdits.due(task(), day, null, zone)
        assertEquals(TaskChange(), result.change)
        assertNull(result.moveDate)
    }

    @Test
    fun `new day writes date and time`() {
        val result = TaskEdits.due(task(), day.plusDays(1), LocalTime.of(9, 5), zone)
        assertEquals(TaskChange(dueDate = day.plusDays(1), dueTime = "09:05"), result.change)
        assertNull(result.moveDate)
    }

    @Test
    fun `clearing the day clears the due`() {
        val result = TaskEdits.due(task(time = LocalTime.of(18, 0)), null, null, zone)
        assertEquals(TaskChange(clearDue = true), result.change)
    }

    @Test
    fun `time only change keeps the day`() {
        val result = TaskEdits.due(task(), day, LocalTime.of(14, 30), zone)
        assertEquals(TaskChange(dueDate = day, dueTime = "14:30"), result.change)
    }

    @Test
    fun `recurring task moves instead of updating its day`() {
        val result = TaskEdits.due(task(recurring = true), day.plusDays(2), null, zone)
        assertEquals(day.plusDays(2), result.moveDate)
        assertEquals(TaskChange(), result.change)
    }

    @Test
    fun `recurring task with a new time carries the time to the move`() {
        val result = TaskEdits.due(task(recurring = true), day.plusDays(2), LocalTime.of(8, 0), zone)
        assertEquals(day.plusDays(2), result.moveDate)
        assertEquals(TaskChange(dueTime = "08:00"), result.change)
    }

    @Test
    fun `start follows the same rules`() {
        assertEquals(TaskChange(), TaskEdits.start(task(), null, null, zone))
        assertEquals(
            TaskChange(startDate = day, startTime = "07:00"),
            TaskEdits.start(task(), day, LocalTime.of(7, 0), zone),
        )
        assertEquals(TaskChange(clearStart = true), TaskEdits.start(task(start = day), null, null, zone))
    }

    @Test
    fun `project and estimate are explicit about clearing`() {
        val withProject = task().copy(projectUid = "p1", estimatedMinutes = 30)
        assertEquals(TaskChange(), TaskEdits.project(withProject, "p1"))
        assertEquals(TaskChange(clearProject = true), TaskEdits.project(withProject, null))
        assertEquals(TaskChange(projectUid = "p2"), TaskEdits.project(withProject, "p2"))
        assertEquals(TaskChange(clearEstimate = true), TaskEdits.estimate(withProject, null))
        assertEquals(TaskChange(estimatedMinutes = 45), TaskEdits.estimate(withProject, 45))
    }

    @Test
    fun `text writes only what changed and never an empty title`() {
        val t = task()
        assertEquals(TaskChange(), TaskEdits.text(t, "Payer", "Réf 12"))
        assertEquals(TaskChange(name = "Payer SIG"), TaskEdits.text(t, " Payer SIG ", "Réf 12"))
        assertEquals(TaskChange(), TaskEdits.text(t, "   ", "Réf 12"))
        assertEquals(TaskChange(note = ""), TaskEdits.text(t, "Payer", ""))
    }

    @Test
    fun `instant helper keeps zone`() {
        assertEquals(LocalTime.of(9, 0), instantTime(Instant.parse("2026-10-28T08:00:00Z"), zone))
    }
}
