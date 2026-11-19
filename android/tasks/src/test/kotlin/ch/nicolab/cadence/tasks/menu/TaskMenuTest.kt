package ch.nicolab.cadence.tasks.menu

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TaskMenuTest {
    private fun task(
        uid: String = "t1",
        status: Int = TaskStatus.NOT_STARTED,
        pinnedAt: Instant? = null,
        fileBacked: Boolean = false,
        recurring: Boolean = false,
        parentUid: String? = null,
    ) = TaskItem(
        uid = uid,
        name = "Tâche",
        status = status,
        pinnedAt = pinnedAt,
        fileBacked = fileBacked,
        recurrenceType = if (recurring) "daily" else null,
        parentTaskUid = parentUid,
    )

    @Test
    fun `ordinary task exposes all web menu entries in order`() {
        val entries = TaskMenu.entries(TaskMenuInput(task = task(), includeFunnel = false))
        assertEquals(
            listOf(
                TaskMenuAction.OPEN,
                TaskMenuAction.TOGGLE,
                TaskMenuAction.DATE,
                TaskMenuAction.PRIORITY,
                TaskMenuAction.PROJECT,
                TaskMenuAction.PIN,
                TaskMenuAction.DUPLICATE,
                TaskMenuAction.TURN_INTO_PROJECT,
                TaskMenuAction.COPY_LINK,
                TaskMenuAction.COPY_TITLE,
                TaskMenuAction.DELETE,
            ),
            entries.map { it.action },
        )
        assertFalse(entries.first { it.action == TaskMenuAction.TOGGLE }.active)
        assertFalse(entries.first { it.action == TaskMenuAction.PIN }.active)
        assertTrue(entries.last().danger)
    }

    @Test
    fun `screen lead actions come first and closed or pinned state is reflected`() {
        val entries = TaskMenu.entries(
            TaskMenuInput(
                task = task(status = TaskStatus.DONE, pinnedAt = Instant.parse("2026-11-19T08:00:00Z")),
                canMoveUp = true,
                canMoveDown = true,
                includeFunnel = false,
            ),
        )
        assertEquals(listOf(TaskMenuAction.MOVE_UP, TaskMenuAction.MOVE_DOWN, TaskMenuAction.OPEN), entries.take(3).map { it.action })
        assertTrue(entries.first { it.action == TaskMenuAction.TOGGLE }.active)
        assertTrue(entries.first { it.action == TaskMenuAction.PIN }.active)
    }

    @Test
    fun `todo-md task omits project, duplicate, turn into project and delete`() {
        val actions = TaskMenu.entries(TaskMenuInput(task = task(fileBacked = true), includeFunnel = false)).map { it.action }
        assertFalse(TaskMenuAction.PROJECT in actions)
        assertFalse(TaskMenuAction.DUPLICATE in actions)
        assertFalse(TaskMenuAction.TURN_INTO_PROJECT in actions)
        assertFalse(TaskMenuAction.DELETE in actions)
        assertTrue(TaskMenuAction.DATE in actions)
        assertTrue(TaskMenuAction.COPY_LINK in actions)
        assertTrue(TaskMenuAction.COPY_TITLE in actions)
    }

    @Test
    fun `recurring or subtask omits turn into project and funnel`() {
        val recurringActions = TaskMenu.entries(TaskMenuInput(task = task(recurring = true))).map { it.action }
        assertFalse(TaskMenuAction.TURN_INTO_PROJECT in recurringActions)
        assertFalse(TaskMenuAction.FUNNEL_IN_VIEW in recurringActions)

        val subtaskActions = TaskMenu.entries(TaskMenuInput(task = task(parentUid = "p1"))).map { it.action }
        assertFalse(TaskMenuAction.TURN_INTO_PROJECT in subtaskActions)
        assertFalse(TaskMenuAction.FUNNEL_IN_VIEW in subtaskActions)
    }

    @Test
    fun `taskUrl builds full url when server base is known and relative path offline`() {
        assertEquals("https://cadence.example/task/t1", TaskMenu.taskUrl("https://cadence.example/", "t1"))
        assertEquals("/task/t1", TaskMenu.taskUrl(null, "t1"))
        assertEquals("/task/t1", TaskMenu.taskUrl("   ", "t1"))
    }
}
