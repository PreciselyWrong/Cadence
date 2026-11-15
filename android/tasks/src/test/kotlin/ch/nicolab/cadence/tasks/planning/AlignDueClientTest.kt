package ch.nicolab.cadence.tasks.planning

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AlignDueClientTest {
    private fun response(on: Boolean?): JsonObject = Json.parseToJsonElement(
        if (on == null) """{"settings":{"horizonDays":3}}""" else """{"settings":{"alignDueToPlan":$on}}""",
    ) as JsonObject

    @Test
    fun `lit le reglage du serveur, coupe s'il manque`() = runBlocking {
        assertTrue(AlignDueClient { _, _, _, _ -> response(true) }.read())
        assertFalse(AlignDueClient { _, _, _, _ -> response(null) }.read())
    }

    @Test
    fun `l'enregistre par les reglages de planification et rend la valeur du serveur`() = runBlocking {
        val calls = mutableListOf<Triple<String, String, JsonObject?>>()
        val client = AlignDueClient { method, path, _, body ->
            calls += Triple(method, path, body)
            response(true)
        }

        assertTrue(client.write(true))
        assertEquals(
            listOf(Triple("PUT", "/api/v1/daily-plan/suggestions", JsonObject(mapOf("alignDueToPlan" to JsonPrimitive(true))))),
            calls,
        )
    }
}
