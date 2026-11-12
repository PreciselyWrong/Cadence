package ch.nicolab.cadence.tasks.triage

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MailCardTest {
    private val json = Json { ignoreUnknownKeys = true }

    private val queue = """
        {"count":1,"tasks":{},"mail_archive":true,"items":[
         {"key":"mail:m1","type":"mail","source":"mail","task_uid":null,"action":"decide_mail",
          "payload":{"mail_uid":"m1","account":"perso","from_name":"Alice Martin","from_address":"alice@example.com",
           "subject":"Devis cuisine","received_at":"2026-11-10T09:00:00.000Z","summary":"Demande de valider le devis",
           "suggestion":{"kind":"task","task_name":"Valider le devis","due_date":"2026-11-14"},
           "draft_excerpt":"Bonjour Alice","gmail_url":"https://mail.google.com/mail/u/0/#inbox/abc"},
          "reason":"Demande de valider le devis","details":[]}]}
    """.trimIndent()

    @Test
    fun `une carte Mail se lit depuis la file, avec l'archivage permis`() {
        val decoded = json.decodeFromString<TriageQueueDto>(queue)
        val card = MailPayload.parse(decoded.items.single().payload)

        assertTrue(decoded.mailArchive)
        assertEquals(MAIL_TYPE, decoded.items.single().type)
        assertEquals("m1", card?.mailUid)
        assertEquals("Devis cuisine", card?.subject)
        assertEquals("Alice Martin", card?.sender)
        assertEquals("Bonjour Alice", card?.draftExcerpt)
        assertEquals("https://mail.google.com/mail/u/0/#inbox/abc", card?.gmailUrl)
        assertFalse(card!!.replyFirst)
        assertEquals("Valider le devis", card.taskName)
        assertEquals("2026-11-14", card.dueDate)
    }

    @Test
    fun `sans passerelle, la file ne propose pas l'archivage`() {
        assertFalse(json.decodeFromString<TriageQueueDto>("""{"items":[],"tasks":{},"count":0}""").mailArchive)
    }

    @Test
    fun `sans suggestion, la tâche prend l'objet, puis le résumé`() {
        val card = MailPayload.parse(payload { put("suggestion", null as String?) })!!
        assertEquals("Devis cuisine", card.taskName)
        assertNull(card.dueDate)

        val bare = MailPayload.parse(
            payload {
                put("subject", null as String?)
                put("suggestion", null as String?)
            },
        )!!
        assertEquals("Demande de valider le devis", bare.taskName)
    }

    @Test
    fun `une suggestion de réponse met Répondre en premier, l'expéditeur sans nom est son adresse`() {
        val card = MailPayload.parse(
            payload {
                put("suggestion", buildJsonObject { put("kind", "reply") })
                put("from_name", null as String?)
            },
        )!!
        assertTrue(card.replyFirst)
        assertEquals("alice@example.com", card.sender)
    }

    @Test
    fun `une adresse hors de Gmail n'ouvre rien`() {
        listOf("javascript:alert(1)", "https://evil.example/mail.google.com/", "http://mail.google.com/x").forEach { url ->
            assertNull(MailPayload.parse(payload { put("gmail_url", url) })?.gmailUrl, url)
        }
    }

    @Test
    fun `une charge sans carte ou sans résumé n'est pas une carte`() {
        assertNull(MailPayload.parse(null))
        assertNull(MailPayload.parse(payload { put("mail_uid", null as String?) }))
        assertNull(MailPayload.parse(payload { put("summary", null as String?) }))
    }

    @Test
    fun `chaque décision part vers la carte, avec sa clé`() {
        val call = MailRequests.decide("m1", MailDecision.TASK, buildJsonObject { put("name", "Valider") }, archive = true, key = "k1", label = "À trier")

        assertEquals("POST", call.method)
        assertEquals("/api/v1/triage/mail/m1/decide", call.path)
        assertEquals("triage-mail:m1", call.key)
        assertEquals("À trier", call.label)
        val body = call.body!!
        assertEquals("task", body["decision"]?.jsonPrimitive?.content)
        assertEquals("Valider", body["payload"]?.jsonObject?.get("name")?.jsonPrimitive?.content)
        assertTrue(body["archive"]!!.jsonPrimitive.boolean)
        assertEquals("k1", body["idempotency_key"]?.jsonPrimitive?.content)
        assertEquals(
            mapOf(MailDecision.TASK to "task", MailDecision.REPLY to "reply", MailDecision.LATER to "later", MailDecision.DISMISS to "dismiss"),
            MailDecision.entries.associateWith { it.wire },
        )
    }

    @Test
    fun `un mail remis à plus tard n'est jamais archivé`() {
        val call = MailRequests.decide("m1", MailDecision.LATER, JsonObject(emptyMap()), archive = true, key = "k2", label = "À trier")
        assertFalse(call.body!!["archive"]!!.jsonPrimitive.boolean)
    }

    private fun payload(change: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit): JsonObject {
        val base = json.decodeFromString<TriageQueueDto>(queue).items.single().payload!!
        val extra = buildJsonObject(change)
        return JsonObject(base + extra)
    }
}
