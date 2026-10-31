package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.sync.OutboxOp
import ch.nicolab.cadence.tasks.sync.PendingOverlay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ProjectStatusOpTest {
    @Test
    fun `a status change is a project upsert carrying only the status field`() {
        val op = LocalOps.upsert("project", "p1", mapOf("status" to JsonPrimitive(ProjectStatus.PAUSED.wire)), "clock-1", 1_000L)
        val payload = Json.parseToJsonElement(op.payloadJson).jsonObject
        assertEquals("project", payload.getValue("entity").jsonPrimitive.content)
        assertEquals("upsert", payload.getValue("action").jsonPrimitive.content)
        val fields = payload.getValue("fields").jsonObject
        assertEquals(setOf("status"), fields.keys)
        assertEquals("paused", fields.getValue("status").jsonObject.getValue("value").jsonPrimitive.content)
    }

    @Test
    fun `a pending status change survives a pull of the project`() {
        val server = Json.parseToJsonElement("""{"uid":"p1","name":"Alpha","status":"in_progress"}""").jsonObject
        val op = LocalOps.upsert("project", "p1", mapOf("status" to JsonPrimitive("paused")), "clock-1", 1_000L)
        val pending = OutboxOp(op.opId, "project", "p1", "upsert", Json.parseToJsonElement(op.payloadJson).jsonObject)
        val merged: JsonObject = PendingOverlay.apply(server, listOf(pending))!!
        assertEquals("paused", WireCodec.projectFromWire(merged).status)
    }
}
