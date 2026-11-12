package ch.nicolab.cadence.tasks.triage

import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.sync.encodePath
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Type d'un mail proposé par un agent dans la file « À trier » (`decide_mail`, `docs/43-mail-triage.md`). */
const val MAIL_TYPE = "mail"

/** Décision sur un mail, telle que `POST /api/v1/triage/mail/:uid/decide` la reçoit. */
enum class MailDecision(val wire: String) {
    TASK("task"),
    REPLY("reply"),
    LATER("later"),
    DISMISS("dismiss"),
}

/**
 * Carte Mail. Tout texte vient du mail : il s'affiche tel quel, jamais en lien. [gmailUrl] n'existe que pour une
 * adresse Gmail, la seule qu'on ouvre.
 */
data class MailCardData(
    val mailUid: String,
    val sender: String?,
    val subject: String?,
    val receivedAt: String?,
    val summary: String,
    val draftExcerpt: String?,
    val gmailUrl: String?,
    /** L'agent suggère une réponse : Répondre passe avant Tâche. */
    val replyFirst: Boolean,
    /** Nom proposé pour la tâche : celui de l'agent, sinon l'objet, sinon le résumé. */
    val taskName: String,
    val dueDate: String?,
)

/** Lecture tolérante de la charge utile : une forme inconnue donne null, jamais une exception. */
object MailPayload {
    private const val GMAIL = "https://mail.google.com/"

    fun parse(payload: JsonObject?): MailCardData? {
        payload ?: return null
        val mailUid = text(payload, "mail_uid") ?: return null
        val summary = text(payload, "summary") ?: return null
        val subject = text(payload, "subject")
        val suggestion = payload["suggestion"] as? JsonObject
        return MailCardData(
            mailUid = mailUid,
            sender = text(payload, "from_name") ?: text(payload, "from_address"),
            subject = subject,
            receivedAt = text(payload, "received_at"),
            summary = summary,
            draftExcerpt = text(payload, "draft_excerpt"),
            gmailUrl = text(payload, "gmail_url")?.takeIf { it.startsWith(GMAIL) },
            replyFirst = suggestion?.let { text(it, "kind") } == "reply",
            taskName = suggestion?.let { text(it, "task_name") } ?: subject ?: summary,
            dueDate = suggestion?.let { text(it, "due_date") },
        )
    }

    private fun text(source: JsonObject, key: String): String? =
        (source[key] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)
}

/** Appels de la file « À trier » pour un mail : une décision par carte, rejouée hors ligne avec sa clé. */
internal object MailRequests {
    fun decide(mailUid: String, decision: MailDecision, payload: JsonObject, archive: Boolean, key: String, label: String) = DeferredCall(
        key = "triage-mail:$mailUid",
        method = "POST",
        path = "/api/v1/triage/mail/${encodePath(mailUid)}/decide",
        body = buildJsonObject {
            put("decision", decision.wire)
            put("payload", payload)
            // Un mail remis à plus tard reste dans la boîte de réception.
            put("archive", archive && decision != MailDecision.LATER)
            put("idempotency_key", key)
        },
        label = label,
    )
}
