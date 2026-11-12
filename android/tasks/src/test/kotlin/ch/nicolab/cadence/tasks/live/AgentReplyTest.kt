package ch.nicolab.cadence.tasks.live

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AgentReplyTest {
    @Test
    fun acceptsOnlyARouteOfThePluginItself() {
        assertEquals("/plugins/hermes/x/inbox/m1/reply", AgentReply.validPath("/plugins/hermes/x/inbox/m1/reply", "hermes"))
        assertEquals("/plugins/hermes/x/a_b-C9", AgentReply.validPath("/plugins/hermes/x/a_b-C9", "hermes"))
    }

    @Test
    fun refusesAnyOtherPath() {
        listOf(
            "/plugins/other/x/inbox/m1/reply",
            "/plugins/hermes/inbox/m1/reply",
            "/plugins/hermes/x/",
            "/plugins/hermes/x",
            "/plugins/hermes/x/../../users",
            "/plugins/hermes/x/./reply",
            "/plugins/hermes/x/a//b",
            "/plugins/hermes/x/a/b/",
            "/plugins/hermes/x/a?b=1",
            "/plugins/hermes/x/a%2e%2e",
            "//evil.example/plugins/hermes/x/a",
            "https://evil.example/plugins/hermes/x/a",
        ).forEach { assertNull(AgentReply.validPath(it, "hermes"), it) }
        assertNull(AgentReply.validPath("/plugins/hermes/x/a", null))
        assertNull(AgentReply.validPath(null, "hermes"))
    }

    @Test
    fun buildsTheRequest() {
        assertEquals(
            "https://cadence.example/api/plugins/hermes/x/inbox/m1/reply",
            AgentReply.url("https://cadence.example/", "/plugins/hermes/x/inbox/m1/reply"),
        )
        val body = Json.parseToJsonElement(AgentReply.body("Oui, « jeudi »\nmerci")).jsonObject
        assertEquals(setOf("text"), body.keys)
        assertEquals("Oui, « jeudi »\nmerci", body["text"]!!.jsonPrimitive.content)
    }

    @Test
    fun decidesWhatFollowsEachAnswer() {
        assertEquals(ReplyStep.Sent, AgentReply.step(202, 0))
        assertEquals(ReplyStep.Retry(offline = true), AgentReply.step(null, 40))
        assertEquals(ReplyStep.Retry(offline = false), AgentReply.step(409, 0))
        assertEquals(ReplyStep.Failed(ReplyFailure.BUSY), AgentReply.step(409, AgentReply.MAX_ATTEMPTS - 1))
        assertEquals(ReplyStep.Failed(ReplyFailure.GONE), AgentReply.step(404, 0))
        assertEquals(ReplyStep.Failed(ReplyFailure.NOT_CONFIGURED), AgentReply.step(503, 0))
        assertEquals(ReplyStep.Retry(offline = false), AgentReply.step(502, 1))
        assertEquals(ReplyStep.Failed(ReplyFailure.REFUSED, 400), AgentReply.step(400, 0))
    }

    @Test
    fun theNotificationSurvivesTheReplyIntent() {
        val notification = LiveNotification(
            uid = "n1",
            title = "Hermes",
            message = "Je décale la réunion ?",
            sources = listOf("mobile"),
            openPath = "/plugins/hermes?msg=m1",
            taskUid = null,
            pluginId = "hermes",
            replyPath = "/plugins/hermes/x/inbox/m1/reply",
        )
        assertEquals(notification, LiveNotification.decode(LiveNotification.encode(notification)))
    }
}
