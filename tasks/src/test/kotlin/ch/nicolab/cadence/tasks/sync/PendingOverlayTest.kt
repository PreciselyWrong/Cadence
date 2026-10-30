package ch.nicolab.cadence.tasks.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Test

class PendingOverlayTest {
    private val server = buildJsonObject {
        put("uid", "task-1")
        put("name", "serveur")
        put("status", 0)
        put("due_date", "2026-11-02T00:00:00Z")
    }

    @Test
    fun `une modification en attente remplace la valeur serveur`() {
        val merged = PendingOverlay.apply(server, listOf(upsert("name" to "local")))!!

        assertEquals("local", merged["name"]!!.jsonPrimitive.content)
        assertEquals("0", merged["status"]!!.jsonPrimitive.content)
    }

    @Test
    fun `une suppression en attente retire la ligne`() {
        assertNull(PendingOverlay.apply(server, listOf(OutboxOp("op", "task", "task-1", "delete", JsonObject(emptyMap())))))
    }

    @Test
    fun `une occurrence en attente reste masquée tant que la date n'a pas avancé`() {
        val occurrence = OutboxOp(
            "op",
            "task",
            "task-1",
            "complete_occurrence",
            buildJsonObject { put("occurrence_date", "2026-11-02T00:00:00Z") },
        )

        assertEquals("2", PendingOverlay.apply(server, listOf(occurrence))!!["status"]!!.jsonPrimitive.content)

        val advanced = PendingOverlay.apply(
            buildJsonObject { put("uid", "task-1"); put("status", 0); put("due_date", "2026-11-09T00:00:00Z") },
            listOf(occurrence),
        )!!
        assertEquals("0", advanced["status"]!!.jsonPrimitive.content)
    }

    private fun upsert(vararg fields: Pair<String, String>) = OutboxOp(
        opId = "op-1",
        entity = "task",
        uid = "task-1",
        action = "upsert",
        payload = buildJsonObject {
            put("fields", buildJsonObject {
                fields.forEach { (name, value) ->
                    put(name, buildJsonObject {
                        put("value", value)
                        put("hlc", "1700000000001-0000-and000000001")
                    })
                }
            })
        },
    )
}
