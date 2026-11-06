package ch.nicolab.cadence.tasks.ui.brief

import ch.nicolab.cadence.tasks.brief.MoveDto
import ch.nicolab.cadence.tasks.brief.TonightDto
import ch.nicolab.cadence.tasks.model.TaskItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class MyDayTest {
    private fun task(uid: String) = TaskItem(uid = uid, name = uid)
    private fun priority(uid: String) = TonightDto(taskUid = uid)
    private fun move(uid: String) = MoveDto(proposalKey = "m:$uid", taskUid = uid)

    @Test
    fun aTaskAppearsOnlyOnce() {
        val lists = MyDay.lists(
            priorities = listOf(priority("a")),
            moves = listOf(move("a"), move("b")),
            overdue = listOf(task("a"), task("b"), task("c")),
        )

        assertEquals(listOf("a"), lists.priorities.map { it.taskUid })
        assertEquals(listOf("b"), lists.moves.map { it.taskUid })
        assertEquals(listOf("c"), lists.overdue.map { it.uid })
    }

    @Test
    fun withoutABriefAllOverdueTasksStayToTriage() {
        val lists = MyDay.lists(emptyList(), emptyList(), listOf(task("a")))

        assertEquals(listOf("a"), lists.overdue.map { it.uid })
    }
}
