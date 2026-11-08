package ch.nicolab.cadence.tasks.triage

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class LinkReviewTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `un lien à revoir se lit depuis sa charge utile de la file`() {
        val item = json.decodeFromString<TriageItemDto>(
            """
            {"key":"link_review:l1","type":"link_review","source":"rules","task_uid":null,"action":"review_link",
             "payload":{"link_uid":"l1","title":null,"url":"https://example.com/a","review_at":"2026-11-08"},
             "reason":"","details":[]}
            """.trimIndent(),
        )

        assertEquals(LinkReviewCard(linkUid = "l1", title = null, url = "https://example.com/a"), LinkReviewPayload.parse(item.payload))
        assertNull(item.taskUid)
    }

    @Test
    fun `un titre présent est gardé`() {
        val payload = buildJsonObject {
            put("link_uid", "l2")
            put("title", "Guide")
            put("url", "https://example.com/b")
        }

        assertEquals("Guide", LinkReviewPayload.parse(payload)?.title)
    }

    @Test
    fun `une charge sans lien ou sans adresse n'est pas une carte`() {
        assertNull(LinkReviewPayload.parse(null))
        assertNull(LinkReviewPayload.parse(buildJsonObject { put("url", "https://example.com/c") }))
        assertNull(LinkReviewPayload.parse(buildJsonObject { put("link_uid", "l3") }))
    }

    @Test
    fun `chaque décision part vers la revue du lien`() {
        val expected = mapOf(
            LinkReviewDecision.KEEP to "keep",
            LinkReviewDecision.ARCHIVE to "archive",
            LinkReviewDecision.LATER to "later",
        )

        expected.forEach { (decision, wire) ->
            val call = LinkReviewRequests.decide("l1", decision, "Guide")

            assertEquals("POST", call.method)
            assertEquals("/api/v1/triage/links/l1/review", call.path)
            assertEquals(wire, call.body?.jsonObject?.get("decision")?.jsonPrimitive?.content)
            assertEquals("triage-link-review:l1", call.key)
            assertEquals("Guide", call.label)
        }
    }
}
