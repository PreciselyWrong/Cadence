package ch.nicolab.cadence.tasks.triage

import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.sync.encodePath
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Type d'un mail proposé par un agent dans la file « À trier » (`decide_mail`, `docs/43-mail-triage.md`). */
const val MAIL_TYPE = "mail"

/** Décision sur un mail, telle que `POST /api/v1/triage/mail/:uid/decide` la reçoit. */
enum class MailDecision(val wire: String, val canArchive: Boolean = false) {
    TASK("task", canArchive = true),
    REPLY("reply", canArchive = true),
    EVENT("event", canArchive = true),
    LATER("later"),
    DISMISS("dismiss", canArchive = true),
    DRAFT("draft"),
    ARCHIVE("archive"),
    NOTE("note"),
}

/** Une des actions que le serveur propose sur une carte du paquet ; l'ordre de la carte est gardé. */
enum class MailOption(val wire: String, val decision: MailDecision) {
    DRAFT("draft", MailDecision.DRAFT),
    /** Offerte par les cartes dérivées de l'ancien conseil ; elle ouvre le fil dans Gmail, donc seulement avec une adresse Gmail. */
    REPLY("reply", MailDecision.REPLY),
    TASK("task", MailDecision.TASK),
    EVENT("event", MailDecision.EVENT),
    LATER("later", MailDecision.LATER),
    ARCHIVE("archive", MailDecision.ARCHIVE),
    DISMISS("dismiss", MailDecision.DISMISS),
    ;

    companion object {
        fun of(wire: String?): MailOption? = entries.firstOrNull { it.wire == wire }
    }
}

/** Action faite par le serveur sur une carte (`action` : type et état), lue telle quelle. */
data class MailActionData(val type: String, val state: String)

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
    /** Conseil de l'agent : `task`, `reply`, `read`, `event`, ou null. */
    val kind: String? = null,
    /** Rendez-vous que fixe le mail (`kind` = `event`), à créer dans l'agenda par l'agent. */
    val event: MailEventData? = null,
    /** Actions proposées (2 à 5, ordre gardé) ; vide pour une carte d'avant le paquet v2, qui garde ses boutons d'avant. */
    val options: List<MailOption> = emptyList(),
    /** Action que l'agent recommande, parmi [options] ; elle est en surbrillance et répond au glissement droit. */
    val recommended: MailOption? = null,
    /** Début du brouillon préparé par l'agent, en texte brut. */
    val draftBody: String? = null,
    /** Extrait du mail, en texte brut, rogné à [MailPayload.EXCERPT_MAX_LENGTH]. */
    val excerpt: String? = null,
    /** Action de la carte (archivage, brouillon, agenda) et son état, lus tels quels. */
    val action: MailActionData? = null,
    /** Erreur de la dernière action, affichée en haut de la carte. */
    val actionError: String? = null,
)

/** Rendez-vous d'une carte Mail : [start] est un jour (journée entière) ou une heure ISO 8601 avec son décalage. */
data class MailEventData(val title: String?, val start: String, val end: String?, val allDay: Boolean, val location: String?)

/** Lecture tolérante de la charge utile : une forme inconnue donne null, jamais une exception. */
object MailPayload {
    private const val GMAIL = "https://mail.google.com/"
    const val EXCERPT_MAX_LENGTH = 1500
    private const val OPTIONS_MIN = 2
    private const val OPTIONS_MAX = 5

    fun parse(payload: JsonObject?): MailCardData? {
        payload ?: return null
        val mailUid = text(payload, "mail_uid") ?: return null
        val summary = text(payload, "summary") ?: return null
        val subject = text(payload, "subject")
        val suggestion = payload["suggestion"] as? JsonObject
        val gmailUrl = text(payload, "gmail_url")?.takeIf { it.startsWith(GMAIL) }
        val options = options(payload["options"] as? JsonArray, hasGmail = gmailUrl != null)
        return MailCardData(
            mailUid = mailUid,
            sender = text(payload, "from_name") ?: text(payload, "from_address"),
            subject = subject,
            receivedAt = text(payload, "received_at"),
            summary = summary,
            draftExcerpt = text(payload, "draft_excerpt"),
            gmailUrl = gmailUrl,
            replyFirst = suggestion?.let { text(it, "kind") } == "reply",
            taskName = suggestion?.let { text(it, "task_name") } ?: subject ?: summary,
            dueDate = suggestion?.let { text(it, "due_date") },
            kind = suggestion?.let { text(it, "kind") },
            event = (suggestion?.get("event") as? JsonObject)?.let(::event),
            options = options,
            recommended = text(payload, "recommended")?.let(MailOption::of)?.takeIf { it in options },
            draftBody = (payload["draft"] as? JsonObject)?.let { text(it, "body") },
            excerpt = text(payload, "excerpt")?.take(EXCERPT_MAX_LENGTH),
            action = (payload["action"] as? JsonObject)?.let { action ->
                val type = text(action, "type") ?: return@let null
                val state = text(action, "state") ?: return@let null
                MailActionData(type, state)
            },
            actionError = text(payload, "action_error"),
        )
    }

    /**
     * Options inconnues écartées, doublons gardés une fois, Répondre écartée sans adresse Gmail ; hors de 2 à 5, la carte
     * n'a pas d'options.
     */
    private fun options(raw: JsonArray?, hasGmail: Boolean): List<MailOption> {
        val known = raw.orEmpty()
            .mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.let(MailOption::of) }
            .filter { it != MailOption.REPLY || hasGmail }
            .distinct()
        return known.takeIf { it.size in OPTIONS_MIN..OPTIONS_MAX }.orEmpty()
    }

    private fun event(source: JsonObject): MailEventData? {
        val start = text(source, "start") ?: return null
        return MailEventData(
            title = text(source, "title"),
            start = start,
            end = text(source, "end"),
            allDay = (source["all_day"] as? JsonPrimitive)?.booleanOrNull ?: !start.contains('T'),
            location = text(source, "location"),
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
            // Seules certaines décisions archivent le fil ; « Plus tard » le garde dans la boîte de réception.
            put("archive", archive && decision.canArchive)
            put("idempotency_key", key)
        },
        label = label,
    )
}
