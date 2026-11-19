package ch.nicolab.cadence.tasks.relations

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TaskRelationsTest {
    @Test
    fun parseList_readsBlocksAndBlockedBy() {
        val body = Json.parseToJsonElement(
            """
            {
              "relations": [
                {"uid":"r1","type":"blocks","task":{"uid":"t2","name":"Déployer","status":0}},
                {"uid":"r2","type":"blocked_by","task":{"uid":"t3","name":"Tester","status":2}}
              ]
            }
            """.trimIndent(),
        ).jsonObject
        val items = TaskRelations.parseList(body)
        assertEquals(2, items.size)
        assertEquals(listOf("r1"), TaskRelations.blocks(items).map { it.uid })
        assertEquals(listOf("r2"), TaskRelations.blockedBy(items).map { it.uid })
    }

    @Test
    fun hasOpenBlocker_trueOnlyWhenBlockedByOpenTask() {
        val closedBlocker = TaskRelationItem("r1", "blocked_by", RelatedTaskRef("t1", "Fait", TaskStatus.DONE))
        val openBlocker = TaskRelationItem("r2", "blocked_by", RelatedTaskRef("t2", "Ouvert", TaskStatus.IN_PROGRESS))
        val blocksOther = TaskRelationItem("r3", "blocks", RelatedTaskRef("t3", "Autre", TaskStatus.NOT_STARTED))

        assertFalse(TaskRelations.hasOpenBlocker(listOf(closedBlocker, blocksOther)))
        assertTrue(TaskRelations.hasOpenBlocker(listOf(closedBlocker, openBlocker)))
    }

    @Test
    fun cacheRoundTrip_preservesRelations() {
        val items = listOf(
            TaskRelationItem("r1", "blocks", RelatedTaskRef("t2", "Tâche B", TaskStatus.NOT_STARTED)),
        )
        val encoded = TaskRelations.encodeCache(items)
        assertEquals(items, TaskRelations.decodeCache(encoded))
    }

    @Test
    fun createAndDeleteCalls_useExpectedEndpointsAndKeys() {
        val target = TaskItem(uid = "t2", name = "Tâche B", note = null, status = TaskStatus.NOT_STARTED, priority = null)
        val add = TaskRelations.createCall("t1", target, TaskRelations.TYPE_BLOCKS)
        assertEquals("POST", add.method)
        assertEquals("/api/v1/task/t1/relations", add.path)
        assertEquals("task-rel-add:t1:t2:blocks", add.key)

        val del = TaskRelations.deleteCall("t1", "r1")
        assertEquals("DELETE", del.method)
        assertEquals("/api/v1/task/t1/relations/r1", del.path)
        assertEquals("task-rel-del:t1:r1", del.key)
    }

    @Test
    fun pickCandidates_excludesSelfClosedVirtualAndAlreadyLinked() {
        val tasks = listOf(
            TaskItem("t1", "Moi", null, TaskStatus.NOT_STARTED, null),
            TaskItem("t2", "Déjà liée", null, TaskStatus.NOT_STARTED, null),
            TaskItem("t3", "Fermée", null, TaskStatus.DONE, null),
            TaskItem("t4", "Virtuelle", null, TaskStatus.NOT_STARTED, null, virtual = true),
            TaskItem("t5", "Valide", null, TaskStatus.IN_PROGRESS, null),
        )
        val existing = listOf(
            TaskRelationItem("r1", TaskRelations.TYPE_BLOCKS, RelatedTaskRef("t2", "Déjà liée", TaskStatus.NOT_STARTED)),
        )
        val candidates = TaskRelations.pickCandidates(tasks, "t1", TaskRelations.TYPE_BLOCKS, existing, "val")
        assertEquals(listOf("t5"), candidates.map { it.uid })
    }
}
