package ch.nicolab.cadence.tasks.project

import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProjectConversionTest {
    private fun task(
        recurrenceType: String? = null,
        parentTaskUid: String? = null,
        fileBacked: Boolean = false,
        virtual: Boolean = false,
    ) = TaskItem(
        uid = "t1",
        name = "Plan",
        recurrenceType = recurrenceType,
        parentTaskUid = parentTaskUid,
        fileBacked = fileBacked,
        virtual = virtual,
    )

    @Test
    fun `a plain task, even with no repetition, can become a project`() {
        assertTrue(canBecomeProject(task()))
        assertTrue(canBecomeProject(task(recurrenceType = "none")))
    }

    @Test
    fun `a recurring task, an occurrence, a subtask or a TODO md task cannot`() {
        assertFalse(canBecomeProject(task(recurrenceType = "weekly")))
        assertFalse(canBecomeProject(task(virtual = true)))
        assertFalse(canBecomeProject(task(parentTaskUid = "parent")))
        assertFalse(canBecomeProject(task(fileBacked = true)))
    }

    @Test
    fun `the conversion call posts to the task endpoint under a stable key`() {
        val call = projectConversionCall("t1", "Plan")
        assertEquals("task-to-project:t1", call.key)
        assertEquals("POST", call.method)
        assertEquals("/api/v1/task/t1/to-project", call.path)
        assertEquals(null, call.body)
        assertEquals("Transformer en projet : Plan", call.label)
    }

    @Test
    fun `only the conversions still waiting in the queue hide their task`() {
        val keys = listOf("task-to-project:t1", "week-capacity", "task-to-project:t2")
        assertEquals(setOf("t1", "t2"), pendingConversionUids(keys))
        assertTrue(pendingConversionUids(emptyList()).isEmpty())
    }

    @Test
    fun `days since the last activity are counted in the account's zone`() {
        val zone = ZoneId.of("Europe/Zurich")
        val today = LocalDate.of(2026, 11, 12)
        // 2026-10-13 23:30 UTC est déjà le 14 octobre à Zurich : 29 jours, pas 30.
        assertEquals(29, inactiveDays(Instant.parse("2026-10-13T23:30:00Z"), today, zone))
        assertEquals(30, inactiveDays(Instant.parse("2026-10-13T10:00:00Z"), today, zone))
    }

    @Test
    fun `an activity dated after today counts as zero days`() {
        val today = LocalDate.of(2026, 11, 12)
        assertEquals(0, inactiveDays(Instant.parse("2026-11-20T00:00:00Z"), today, ZoneId.of("Europe/Zurich")))
    }
}
