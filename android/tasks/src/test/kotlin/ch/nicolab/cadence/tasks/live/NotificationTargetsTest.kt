package ch.nicolab.cadence.tasks.live

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class NotificationTargetsTest {
    private fun of(
        kind: String? = null,
        proposalUid: String? = null,
        pluginId: String? = null,
        openPath: String? = null,
        taskUid: String? = null,
        projectUid: String? = null,
    ) = NotificationTargets.of(NotificationPayload(kind, proposalUid, pluginId, openPath, taskUid, projectUid))

    @Test
    fun mailReadyOpensTheMailDeck() {
        assertEquals(NotificationTarget.MailDeck, of(kind = "mail_ready"))
    }

    @Test
    fun proposalKindChoosesItsScreen() {
        assertEquals(NotificationTarget.ProposalSheet("p1"), of(kind = "week", proposalUid = "p1"))
        assertEquals(NotificationTarget.Review, of(kind = "review", proposalUid = "p1"))
        assertEquals(NotificationTarget.Career, of(kind = "career", proposalUid = "p1"))
        assertEquals(NotificationTarget.ProposalSheet("p1"), of(kind = null, proposalUid = "p1"))
    }

    @Test
    fun pluginPageNeedsPluginIdAndInternalPath() {
        assertEquals(
            NotificationTarget.Plugin(LiveTarget.Plugin("hermes", "?msg=m1")),
            of(pluginId = "hermes", openPath = "/plugins/hermes?msg=m1"),
        )
        // Sans pluginId, un chemin de plugin ne compte pas (règle du web).
        assertEquals(NotificationTarget.Center, of(openPath = "/plugins/hermes"))
        // Une adresse externe n'ouvre jamais rien.
        assertEquals(NotificationTarget.Center, of(pluginId = "hermes", openPath = "https://example.org/x"))
    }

    @Test
    fun taskThenProjectThenNotificationCenter() {
        assertEquals(NotificationTarget.Task("t-1"), of(taskUid = "t-1", projectUid = "p-1"))
        assertEquals(NotificationTarget.Project("p-1"), of(projectUid = "p-1"))
        assertEquals(NotificationTarget.Center, of(taskUid = "../etc", projectUid = "bad uid"))
        assertEquals(NotificationTarget.Center, of())
    }

    @Test
    fun encodeAndDecodeRoundTrip() {
        val targets = listOf(
            NotificationTarget.ProposalSheet("p1"),
            NotificationTarget.Review,
            NotificationTarget.Career,
            NotificationTarget.MailDeck,
            NotificationTarget.Plugin(LiveTarget.Plugin("hermes", "?msg=m1&x=a:b")),
            NotificationTarget.Task("t-1"),
            NotificationTarget.Project("p-1"),
            NotificationTarget.Center,
        )
        targets.forEach { target ->
            assertEquals(target, NotificationTargets.decode(NotificationTargets.encode(target)), target.toString())
        }
    }

    @Test
    fun decodeRejectsUnknownOrInvalidValues() {
        assertNull(NotificationTargets.decode(null))
        assertNull(NotificationTargets.decode("nothing"))
        assertNull(NotificationTargets.decode("task:bad uid"))
        assertNull(NotificationTargets.decode("plugin:Hermes"))
        assertNull(NotificationTargets.decode("proposal:"))
    }

    @Test
    fun centerParsesReadAndUnreadNewestFirstAndSkipsItemsWithoutUid() {
        val body = Json.parseToJsonElement(
            """
            {"notifications":[
              {"uid":"n2","title":"3 mails à trier","message":"","created_at":"2026-11-13T09:00:00.000Z","read_at":null,
               "data":{"kind":"mail_ready","count":3}},
              {"uid":"n1","title":"Ta carrière a du neuf","message":"Une offre","created_at":"2026-11-12T10:00:00.000Z",
               "read_at":"2026-11-12T11:00:00.000Z","data":{"proposal_uid":"p9","kind":"career","agentLabel":"Hermes"}},
              {"title":"sans uid"}
            ],"total":3}
            """.trimIndent(),
        ).jsonObject
        val items = CenterNotifications.parse(body)
        assertEquals(listOf("n2", "n1"), items.map { it.uid })
        assertFalse(items[0].read)
        assertTrue(items[1].read)
        assertEquals(NotificationTarget.MailDeck, NotificationTargets.of(items[0].payload))
        assertEquals(NotificationTarget.Career, NotificationTargets.of(items[1].payload))
        assertEquals("Hermes", items[1].agentLabel)
    }

    @Test
    fun liveNotificationCarriesProjectUidForTheTapTarget() {
        val event = SseEvent(
            "notification",
            null,
            """{"uid":"n5","title":"Projet","message":"","sources":["mobile"],"data":{"projectUid":"p-7"}}""",
        )
        val notification = LiveNotification.of(event)!!
        assertEquals(NotificationTarget.Project("p-7"), NotificationTargets.of(notification.payload()))
    }
}
