package ch.nicolab.cadence.tasks.live

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AgentMessagesTest {
    // Forme de `GET /api/notifications?includeRead=false&limit=20`.
    private val body = Json.parseToJsonElement(
        """
        {"notifications": [
          {"uid": "a", "title": "Ancien", "created_at": "2026-11-12T08:00:00Z", "data": {"pluginId": "hermes", "openPath": "/plugins/hermes?msg=m1"}},
          {"uid": "t", "title": "Tâche due", "created_at": "2026-11-12T10:00:00Z", "data": {"taskUid": "x"}},
          {"uid": "b", "title": "Récent", "created_at": "2026-11-12T09:00:00Z", "data": {"pluginId": "hermes", "openPath": "https://evil.example"}},
          {"uid": "n", "title": "Sans données", "created_at": "2026-11-12T11:00:00Z", "data": null},
          {"title": "Sans uid", "data": {"pluginId": "hermes"}}
        ], "total": 5}
        """,
    ).jsonObject

    @Test
    fun keepsOnlyPluginMessagesNewestFirst() {
        assertEquals(listOf("b", "a"), AgentMessages.pick(body).map { it.uid })
    }

    @Test
    fun theBannerShowsTheLatestAndCountsTheOthers() {
        val banner = AgentMessages.banner(AgentMessages.pick(body))!!
        assertEquals("Récent", banner.latest.title)
        assertEquals(1, banner.more)
        assertNull(AgentMessages.banner(emptyList()))
    }

    @Test
    fun opensOnlyAnInternalPluginPath() {
        val (recent, old) = AgentMessages.pick(body)
        assertNull(AgentMessages.pluginTarget(recent))
        assertEquals(LiveTarget.Plugin("hermes", "?msg=m1"), AgentMessages.pluginTarget(old))
    }

    @Test
    fun aMissingListIsEmpty() {
        assertEquals(emptyList<AgentMessage>(), AgentMessages.pick(Json.parseToJsonElement("{}").jsonObject))
    }
}
