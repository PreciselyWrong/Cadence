package ch.nicolab.cadence.tasks.triage

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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

    private fun deckCard(fields: String): MailCardData = MailPayload.parse(
        json.parseToJsonElement(
            """{"mail_uid":"m1","summary":"Valider le devis","subject":"Devis cuisine",
               "received_at":"2026-11-10T09:00:00Z","gmail_url":"https://mail.google.com/mail/u/0/#inbox/abc",$fields}""",
        ).jsonObject,
    )!!

    @Test
    fun `les options gardent leur ordre et ignorent les inconnues`() {
        val card = deckCard(""""options":["archive","bogus","task","later"],"recommended":"task"""")
        assertEquals(listOf(MailOption.ARCHIVE, MailOption.TASK, MailOption.LATER), card.options)
    }

    @Test
    fun `répondre est une option qui ouvre Gmail, et disparaît sans adresse Gmail`() {
        val card = deckCard(""""options":["reply","later"],"recommended":"reply"""")
        assertEquals(listOf(MailOption.REPLY, MailOption.LATER), card.options)
        val advice = MailDeck.recommendation(card)
        assertEquals(MailDecision.REPLY, advice.decision)
        assertTrue(advice.opensMail)
        val noGmail = MailPayload.parse(
            json.parseToJsonElement("""{"mail_uid":"m1","summary":"x","options":["reply","later","task"],"recommended":"reply"}""").jsonObject,
        )!!
        assertEquals(listOf(MailOption.LATER, MailOption.TASK), noGmail.options)
        assertNull(noGmail.recommended)
    }

    @Test
    fun `une liste d'options hors de 2 à 5 n'est pas prise`() {
        assertTrue(deckCard(""""options":["task"]""").options.isEmpty())
        assertTrue(deckCard(""""options":["task","later","dismiss","draft","archive","event"]""").options.isEmpty())
    }

    @Test
    fun `le conseil n'est retenu que s'il fait partie des options`() {
        assertEquals(MailOption.DRAFT, deckCard(""""options":["draft","later"],"recommended":"draft"""").recommended)
        assertNull(deckCard(""""options":["draft","later"],"recommended":"archive"""").recommended)
    }

    @Test
    fun `brouillon, extrait, erreur d'action et action sont lus en texte`() {
        val card = deckCard(
            """"draft":{"body":"Bonjour, voici le devis."},"excerpt":"Corps du mail",""" +
                """"action_error":"Gmail refuse l'archivage","action":{"type":"archive","state":"failed"}""",
        )
        assertEquals("Bonjour, voici le devis.", card.draftBody)
        assertEquals("Corps du mail", card.excerpt)
        assertEquals("Gmail refuse l'archivage", card.actionError)
        assertEquals(MailActionData("archive", "failed"), card.action)
    }

    @Test
    fun `un extrait est rogné à 1500 caractères`() {
        assertEquals(1500, deckCard(""""excerpt":"${"a".repeat(2000)}"""").excerpt!!.length)
    }

    @Test
    fun `avec des options, le conseil suit le choix de l'agent et n'ouvre pas Gmail`() {
        val advice = MailDeck.recommendation(deckCard(""""options":["draft","task","later"],"recommended":"draft""""))
        assertEquals(MailDecision.DRAFT, advice.decision)
        assertFalse(advice.opensMail)
    }

    @Test
    fun `sans conseil explicite, la première option sert au glissement droit`() {
        val advice = MailDeck.recommendation(deckCard(""""options":["archive","later"]"""))
        assertEquals(MailDecision.ARCHIVE, advice.decision)
    }

    @Test
    fun `une tâche recommandée garde son nom et son échéance`() {
        val advice = MailDeck.recommendation(
            deckCard(""""options":["task","later"],"recommended":"task","suggestion":{"task_name":"Valider","due_date":"2026-11-14"}"""),
        )
        assertEquals(MailDecision.TASK, advice.decision)
        assertEquals(
            buildJsonObject {
                put("name", "Valider")
                put("due_date", "2026-11-14")
            },
            advice.payload,
        )
    }

    @Test
    fun `la progression compte les cartes décidées sur le total d'ouverture`() {
        assertEquals(DeckProgress(4, 17), MailDeck.progress(remaining = 13, total = 17))
        assertEquals(DeckProgress(0, 3), MailDeck.progress(remaining = 3, total = 0))
        assertEquals(1f, MailDeck.progress(remaining = 0, total = 0).fraction)
    }

    @Test
    fun `une remarque est rognée et une remarque vide n'existe pas`() {
        assertNull(MailDeck.noteText("   "))
        assertEquals("Bonjour", MailDeck.noteText("  Bonjour  "))
        assertEquals(MailDeck.NOTE_MAX_LENGTH, MailDeck.noteText("a".repeat(900))!!.length)
    }

    @Test
    fun `l'archivage ne vaut que pour les décisions qui le permettent`() {
        fun body(decision: MailDecision, archive: Boolean) = MailRequests
            .decide("m1", decision, JsonObject(emptyMap()), archive, key = "k", label = "l")
            .body!!
        assertTrue(body(MailDecision.TASK, archive = true)["archive"]!!.jsonPrimitive.boolean)
        assertFalse(body(MailDecision.LATER, archive = true)["archive"]!!.jsonPrimitive.boolean)
        assertFalse(body(MailDecision.ARCHIVE, archive = true)["archive"]!!.jsonPrimitive.boolean)
        assertFalse(body(MailDecision.NOTE, archive = true)["archive"]!!.jsonPrimitive.boolean)
        assertEquals("note", body(MailDecision.NOTE, archive = false)["decision"]!!.jsonPrimitive.content)
    }
}
