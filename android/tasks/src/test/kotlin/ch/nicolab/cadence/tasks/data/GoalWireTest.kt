package ch.nicolab.cadence.tasks.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class GoalWireTest {
    private fun wire(text: String) = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `a goal reads every synced field and its references`() {
        val goal = WireCodec.goalFromWire(
            wire(
                """{"uid":"g1","title":"Courir","why":"Santé","horizon":"quarter","target_date":"2026-12-31","status":"active",
                "color":"#ff0000","bucket":null,"area_uid":"a1","parent_goal_uid":"g0"}""",
            ),
        )
        assertEquals("Courir", goal.title)
        assertEquals("quarter", goal.horizon)
        assertEquals("2026-12-31", goal.targetDateRaw)
        assertEquals("a1", goal.areaUid)
        assertEquals("g0", goal.parentGoalUid)
        assertNull(goal.bucket)
        val item = goal.toItem()
        assertEquals(java.time.LocalDate.of(2026, 12, 31), item.targetDate)
        assertEquals(true, item.isKeyResult)
    }

    @Test
    fun `a wish keeps its bucket`() {
        val item = WireCodec.goalFromWire(wire("""{"uid":"g2","title":"Voyager","bucket":"do"}""")).toItem()
        assertEquals(ch.nicolab.cadence.tasks.model.GoalBucket.DO, item.bucket)
        assertEquals(true, item.isWish)
    }

    @Test
    fun `a project keeps its next action and goal link`() {
        val project = WireCodec.projectFromWire(wire("""{"uid":"p1","name":"Alpha","next_task_uid":"t1","goal_uid":"g1"}"""))
        assertEquals("t1", project.nextTaskUid)
        assertEquals("g1", project.goalUid)
        assertEquals("t1", project.toItem().nextTaskUid)
        assertNull(WireCodec.projectFromWire(wire("""{"uid":"p1","name":"Alpha","next_task_uid":null}""")).nextTaskUid)
    }

    @Test
    fun `a task goal link stays in the extras and reaches the item`() {
        val task = WireCodec.taskFromWire(wire("""{"uid":"t1","name":"X","goal_uid":"g1"}"""))
        assertEquals("g1", TaskExtras.parse(task.extrasJson)["goal_uid"])
        assertFalse(WireCodec.taskToWire(task).isEmpty())
    }

    @Test
    fun `a project reads its icon and parent`() {
        val project = WireCodec.projectFromWire(wire("""{"uid":"p2","name":"Cuisine","icon":"cook","parent_project_uid":"p1"}"""))
        assertEquals("cook", project.icon)
        assertEquals("p1", project.parentProjectUid)
        val item = project.toItem()
        assertEquals("cook", item.icon)
        assertEquals("p1", item.parentProjectUid)
        val bare = WireCodec.projectFromWire(wire("""{"uid":"p3","name":"Seul","icon":null}""")).toItem()
        assertNull(bare.icon)
        assertNull(bare.parentProjectUid)
    }

    @Test
    fun `a tag reads its path, icon and parent`() {
        val item = WireCodec.tagFromWire(wire("""{"uid":"t2","name":"perso/sport","color":"#00ff00","icon":"run","parent_uid":"t1"}""")).toItem()
        assertEquals("perso/sport", item.name)
        assertEquals("run", item.icon)
        assertEquals("t1", item.parentUid)
        assertNull(WireCodec.tagFromWire(wire("""{"uid":"t3","name":"travail"}""")).toItem().parentUid)
    }
}
