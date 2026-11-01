package ch.nicolab.cadence.tasks.model

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OccurrenceFieldsTest {
    private val day = LocalDate.of(2026, 11, 9)

    @Test
    fun `field edits of an occurrence ask the scope`() {
        listOf(
            TaskChange(name = "x"),
            TaskChange(note = "x"),
            TaskChange(priority = 2),
            TaskChange(clearPriority = true),
            TaskChange(dueTime = "09:30"),
            TaskChange(dueDate = day),
            TaskChange(estimatedMinutes = 30),
            TaskChange(clearEstimate = true),
            TaskChange(projectUid = "p"),
            TaskChange(clearProject = true),
            TaskChange(tagUids = listOf("t")),
            TaskChange(status = TaskStatus.IN_PROGRESS),
        ).forEach { assertTrue(OccurrenceFields.isScoped(it), it.toString()) }
    }

    @Test
    fun `completion, the repeat rule, the start and the review funnel belong to the series`() {
        listOf(
            TaskChange(),
            TaskChange(status = TaskStatus.DONE),
            TaskChange(repetition = Repetition(RepeatType.DAILY)),
            TaskChange(clearDue = true),
            TaskChange(startDate = day),
            TaskChange(inView = true),
            TaskChange(later = true),
            TaskChange(reviewed = true),
        ).forEach { assertFalse(OccurrenceFields.isScoped(it), it.toString()) }
    }

    @Test
    fun `a mixed change splits into the scoped part and the rest`() {
        val change = TaskChange(name = "x", status = TaskStatus.DONE, inView = true)

        assertEquals(TaskChange(name = "x"), OccurrenceFields.scoped(change))
        assertEquals(TaskChange(status = TaskStatus.DONE, inView = true), OccurrenceFields.rest(change))
    }

    @Test
    fun `only a bare day is a date move that the server shifts`() {
        assertTrue(OccurrenceFields.isDateOnly(TaskChange(dueDate = day)))
        assertFalse(OccurrenceFields.isDateOnly(TaskChange(dueDate = day, dueTime = "10:00")))
        assertFalse(OccurrenceFields.isDateOnly(TaskChange(dueDate = day, name = "x")))
        assertFalse(OccurrenceFields.isDateOnly(TaskChange(dueTime = "10:00")))
    }

    @Test
    fun `the next day of a series skips left-out days and stops at its last day`() {
        val rule = RecurrenceRule(exdates = setOf(LocalDate.of(2026, 11, 3)), endDay = LocalDate.of(2026, 11, 4))

        assertEquals(LocalDate.of(2026, 11, 2), RecurrenceExpansion.nextAfter("daily", rule, LocalDate.of(2026, 11, 1)))
        assertEquals(LocalDate.of(2026, 11, 4), RecurrenceExpansion.nextAfter("daily", rule, LocalDate.of(2026, 11, 2)))
        assertNull(RecurrenceExpansion.nextAfter("daily", rule, LocalDate.of(2026, 11, 4)))
        assertNull(RecurrenceExpansion.nextAfter("yearly", RecurrenceRule(), LocalDate.of(2026, 11, 1)))
    }
}
