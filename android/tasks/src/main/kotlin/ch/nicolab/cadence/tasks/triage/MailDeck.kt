package ch.nicolab.cadence.tasks.triage

import java.net.URLEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Ce que fait le gros bouton d'une carte du paquet : la décision, sa charge, et si Gmail s'ouvre aussi. */
data class MailAdvice(val decision: MailDecision, val payload: JsonObject, val opensMail: Boolean)

/**
 * Règles du paquet « Trier mes mails » (`docs/43-mail-triage.md`), comme le web (`frontend/components/Triage/mailDeck.ts`) :
 * les cartes Mail de la file une à une, le conseil de l'agent en bouton principal.
 */
object MailDeck {
    /** Plugin dont la page porte le chat avec les agents. */
    const val CHAT_PLUGIN = "hermes"

    /** Les cartes Mail lisibles, dans l'ordre de la file (cartes passées en dernier, fait par la file). */
    fun cards(items: List<TriageItemDto>): List<Pair<TriageItemDto, MailCardData>> =
        items.filter { it.type == MAIL_TYPE }.mapNotNull { item -> MailPayload.parse(item.payload)?.let { item to it } }

    /** Le conseil en un geste : répondre ou lire ouvrent Gmail ; un rendez-vous part à l'agent ; sinon la tâche. */
    fun recommendation(card: MailCardData): MailAdvice {
        val empty = JsonObject(emptyMap())
        return when {
            card.kind == "reply" && card.gmailUrl != null -> MailAdvice(MailDecision.REPLY, empty, opensMail = true)
            card.kind == "read" && card.gmailUrl != null -> MailAdvice(MailDecision.DISMISS, empty, opensMail = true)
            card.kind == "event" && card.event != null -> MailAdvice(MailDecision.EVENT, empty, opensMail = false)
            else -> MailAdvice(
                MailDecision.TASK,
                buildJsonObject {
                    put("name", card.taskName)
                    card.dueDate?.let { put("due_date", it) }
                },
                opensMail = false,
            )
        }
    }

    /** Requête de la page du plugin : la conversation s'ouvre sur ce mail. */
    fun chatQuery(mailUid: String): String = "?view=chat&mail=" + URLEncoder.encode(mailUid, "UTF-8")
}
