package ch.nicolab.cadence.tasks.swipe

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class UndoChangesTest {
    private val day = LocalDate.of(2026, 10, 30)

    @Test
    fun `restaurer une échéance de journée`() {
        val task = TaskItem(uid = "t", name = "t", dueDay = day, dueDate = Instant.parse("2026-10-30T22:59:59Z"))
        assertEquals(TaskChange(dueDate = day), UndoChanges.restoreDue(task, ZoneOffset.UTC))
    }

    @Test
    fun `restaurer une échéance à heure fixe garde l'heure`() {
        val task = TaskItem(uid = "t", name = "t", dueDay = day, dueDate = Instant.parse("2026-10-30T14:30:00Z"), dueHasTime = true)
        assertEquals(TaskChange(dueDate = day, dueTime = "14:30"), UndoChanges.restoreDue(task, ZoneOffset.UTC))
    }

    @Test
    fun `restaurer l'absence d'échéance efface l'échéance`() {
        assertEquals(TaskChange(clearDue = true), UndoChanges.restoreDue(TaskItem(uid = "t", name = "t"), ZoneOffset.UTC))
    }

    @Test
    fun `restaurer le projet`() {
        assertEquals(TaskChange(projectUid = "p"), UndoChanges.restoreProject(TaskItem(uid = "t", name = "t", projectUid = "p")))
        assertEquals(TaskChange(clearProject = true), UndoChanges.restoreProject(TaskItem(uid = "t", name = "t")))
    }

    @Test
    fun `restaurer la priorité`() {
        assertEquals(TaskChange(priority = TaskPriority.HIGH), UndoChanges.restorePriority(TaskItem(uid = "t", name = "t", priority = TaskPriority.HIGH)))
        assertEquals(TaskChange(clearPriority = true), UndoChanges.restorePriority(TaskItem(uid = "t", name = "t")))
    }
}
