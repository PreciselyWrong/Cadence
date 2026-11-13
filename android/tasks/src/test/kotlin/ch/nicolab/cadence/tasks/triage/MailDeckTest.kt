package ch.nicolab.cadence.tasks.triage

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MailDeckTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun card(suggestion: String = "null", gmail: String = "https://mail.google.com/mail/u/0/#inbox/abc"): MailCardData =
        MailPayload.parse(
            json.parseToJsonElement(
                """{"mail_uid":"m1","summary":"Valider le devis","subject":"Devis cuisine",
                   "received_at":"2026-11-10T09:00:00Z","gmail_url":"$gmail","suggestion":$suggestion}""",
            ).jsonObject,
        )!!

    private fun item(key: String, type: String = MAIL_TYPE) = TriageItemDto(
        key = key,
        type = type,
        source = type,
        action = "decide_mail",
        payload = json.parseToJsonElement("""{"mail_uid":"${key.removePrefix("mail:")}","summary":"x"}""").jsonObject,
        reason = "x",
    )

    @Test
    fun `le paquet ne garde que les mails, dans l'ordre de la file`() {
        val deck = MailDeck.cards(listOf(item("mail:a"), item("task:1", "stale"), item("mail:b")))
        assertEquals(listOf("a", "b"), deck.map { it.second.mailUid })
        assertEquals(listOf("mail:a", "mail:b"), deck.map { it.first.key })
    }

    @Test
    fun `une charge illisible n'entre pas dans le paquet`() {
        val broken = item("mail:z").copy(payload = JsonObject(emptyMap()))
        assertTrue(MailDeck.cards(listOf(broken)).isEmpty())
    }

    @Test
    fun `sans conseil, le bouton principal crée la tâche nommée d'après l'objet`() {
        val advice = MailDeck.recommendation(card())
        assertEquals(MailDecision.TASK, advice.decision)
        assertEquals(buildJsonObject { put("name", "Devis cuisine") }, advice.payload)
        assertFalse(advice.opensMail)
    }

    @Test
    fun `la tâche conseillée garde son nom et son échéance`() {
        val advice = MailDeck.recommendation(card("""{"kind":"task","task_name":"Valider","due_date":"2026-11-14"}"""))
        assertEquals(
            buildJsonObject {
                put("name", "Valider")
                put("due_date", "2026-11-14")
            },
            advice.payload,
        )
    }

    @Test
    fun `répondre et lire ouvrent Gmail`() {
        val reply = MailDeck.recommendation(card("""{"kind":"reply"}"""))
        assertEquals(MailDecision.REPLY, reply.decision)
        assertTrue(reply.opensMail)
        val read = MailDeck.recommendation(card("""{"kind":"read"}"""))
        assertEquals(MailDecision.DISMISS, read.decision)
        assertTrue(read.opensMail)
    }

    @Test
    fun `un rendez-vous est demandé à l'agent, avec sa date lue sur la carte`() {
        val meeting = card("""{"kind":"event","event":{"title":"Visite","start":"2026-11-20T14:00:00+01:00","end":null,"all_day":false,"location":"Rue du Lac 4"}}""")
        val advice = MailDeck.recommendation(meeting)
        assertEquals(MailDecision.EVENT, advice.decision)
        assertEquals(JsonObject(emptyMap()), advice.payload)
        assertEquals("Visite", meeting.event?.title)
        assertEquals("2026-11-20T14:00:00+01:00", meeting.event?.start)
        assertFalse(meeting.event!!.allDay)
        assertEquals("Rue du Lac 4", meeting.event?.location)
    }

    @Test
    fun `un rendez-vous sans début retombe sur la tâche`() {
        val advice = MailDeck.recommendation(card("""{"kind":"event","event":{"title":"Visite"}}"""))
        assertEquals(MailDecision.TASK, advice.decision)
    }

    @Test
    fun `une adresse hors de Gmail n'est jamais ouverte`() {
        val bad = card("""{"kind":"reply"}""", gmail = "https://evil.example/")
        assertNull(bad.gmailUrl)
        assertEquals(MailDecision.TASK, MailDeck.recommendation(bad).decision)
    }

    @Test
    fun `Discuter ouvre la page de chat de Hermes sur ce mail`() {
        assertEquals("?view=chat&mail=m+1%2F", MailDeck.chatQuery("m 1/"))
    }
}
