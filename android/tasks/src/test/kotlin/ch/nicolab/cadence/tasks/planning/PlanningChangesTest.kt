package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.model.TaskChange
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PlanningChangesTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val friday = LocalDate.of(2026, 10, 30)
    private val monday = LocalDate.of(2026, 11, 2)

    @Test
    fun `an accepted block writes the due day and the block start time`() {
        val change = PlanningChanges.place(friday, ProposedBlock("a", 9 * 60 + 5, 9 * 60 + 35))
        assertEquals(TaskChange(dueDate = friday, dueTime = "09:05"), change)
    }

    @Test
    fun `moving a timed task keeps its time, a day task stays a day task`() {
        val timed = TaskItem(
            uid = "t", name = "t", dueDay = friday, dueHasTime = true,
            dueDate = friday.atTime(14, 30).atZone(zone).toInstant(),
        )
        val untimed = TaskItem(uid = "u", name = "u", dueDay = friday, dueDate = friday.atTime(23, 59).atZone(zone).toInstant())
        assertEquals(TaskChange(dueDate = monday, dueTime = "14:30"), PlanningChanges.moveToDay(timed, monday, zone))
        assertEquals(TaskChange(dueDate = monday, dueTime = null), PlanningChanges.moveToDay(untimed, monday, zone))
    }

    @Test
    fun `restore puts the original due back, or clears it when there was none`() {
        val original = TaskItem(
            uid = "t", name = "t", dueDay = friday, dueHasTime = true,
            dueDate = friday.atTime(10, 0).atZone(zone).toInstant(),
        )
        assertEquals(TaskChange(dueDate = friday, dueTime = "10:00"), PlanningChanges.restore(original, zone))
        assertEquals(TaskChange(clearDue = true), PlanningChanges.restore(TaskItem(uid = "n", name = "n"), zone))
        assertEquals(TaskChange(clearDue = true), PlanningChanges.later())
    }

    @Test
    fun `bulk operations skip recurring and closed tasks`() {
        val tasks = listOf(
            TaskItem(uid = "a", name = "a"),
            TaskItem(uid = "r", name = "r", recurrenceType = "daily"),
            TaskItem(uid = "d", name = "d", status = TaskStatus.DONE),
        )
        assertEquals(listOf("a"), PlanningChanges.movable(tasks).map { it.uid })
    }
}
