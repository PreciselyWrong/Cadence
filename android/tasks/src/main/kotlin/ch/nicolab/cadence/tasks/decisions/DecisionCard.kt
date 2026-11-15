package ch.nicolab.cadence.tasks.decisions

import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.sync.encodePath
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Un des choix proposés sur une carte de décision (`docs/49-agent-decisions.md`). */
data class DecisionChoice(
    val id: String,
    val label: String,
    val tone: String? = null,
) {
    val isDanger: Boolean get() = tone == TONE_DANGER

    companion object {
        const val TONE_PRIMARY = "primary"
        const val TONE_DANGER = "danger"
    }
}

/** Carte de décision d'un agent (`GET /api/decisions`). Tout texte est brut ; seul [url] s'ouvre (`https://`). */
data class DecisionCardData(
    val uid: String,
    val kind: String,
    val kindLabel: String,
    val key: String,
    val title: String,
    val context: String? = null,
    val body: String? = null,
    val url: String? = null,
    val choices: List<DecisionChoice>,
    val recommended: String? = null,
    val reason: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/** Lecture tolérante de `GET /api/decisions` : une forme inconnue est ignorée, jamais une exception. */
object DecisionPayload {
    private val KIND_RE = Regex("""^[a-z][a-z0-9_]{0,31}$""")
    private val CHOICE_ID_RE = Regex("""^[a-z][a-z0-9_]{0,23}$""")
    private val RESERVED_CHOICES = setOf("note", "later")
    private const val CHOICES_MIN = 2
    private const val CHOICES_MAX = 5
    private const val HTTPS = "https://"

    fun parseList(body: JsonObject?): List<DecisionCardData> =
        (body?.get("items") as? JsonArray).orEmpty().mapNotNull { parse(it as? JsonObject) }

    fun parse(payload: JsonObject?): DecisionCardData? {
        payload ?: return null
        val uid = text(payload, "uid") ?: return null
        val kind = text(payload, "kind")?.takeIf(KIND_RE::matches) ?: return null
        val kindLabel = text(payload, "kind_label") ?: kind
        val key = text(payload, "key") ?: return null
        val title = text(payload, "title") ?: return null
        val choices = parseChoices(payload["choices"] as? JsonArray)
        if (choices.size !in CHOICES_MIN..CHOICES_MAX) return null
        val choiceIds = choices.map { it.id }.toSet()
        val recommended = text(payload, "recommended")?.takeIf { it in choiceIds }
        return DecisionCardData(
            uid = uid,
            kind = kind,
            kindLabel = kindLabel,
            key = key,
            title = title,
            context = text(payload, "context"),
            body = textRaw(payload, "body"),
            url = text(payload, "url")?.takeIf { it.startsWith(HTTPS) },
            choices = choices,
            recommended = recommended,
            reason = text(payload, "reason"),
            createdAt = text(payload, "created_at"),
            updatedAt = text(payload, "updated_at"),
        )
    }

    private fun parseChoices(raw: JsonArray?): List<DecisionChoice> {
        val seen = HashSet<String>()
        return raw.orEmpty().mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val id = text(obj, "id") ?: return@mapNotNull null
            if (!CHOICE_ID_RE.matches(id) || id in RESERVED_CHOICES || !seen.add(id)) return@mapNotNull null
            val label = text(obj, "label") ?: return@mapNotNull null
            val tone = text(obj, "tone")?.takeIf { it == DecisionChoice.TONE_PRIMARY || it == DecisionChoice.TONE_DANGER }
            DecisionChoice(id = id, label = label, tone = tone)
        }
    }

    private fun text(source: JsonObject, key: String): String? =
        (source[key] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf(String::isNotBlank)

    private fun textRaw(source: JsonObject, key: String): String? =
        (source[key] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)
}

/** Appels différés pour les décisions d'agent (`POST /api/decisions/:uid/decide`). */
internal object DecisionRequests {
    const val DECISION_LATER = "later"
    const val DECISION_NOTE = "note"

    fun decide(
        uid: String,
        decision: String,
        note: String? = null,
        until: String? = null,
        key: String,
        label: String,
    ) = DeferredCall(
        key = "decision:$uid",
        method = "POST",
        path = "/api/decisions/${encodePath(uid)}/decide",
        body = buildJsonObject {
            put("decision", decision)
            if (note != null) put("note", note)
            if (until != null) put("until", until)
            put("idempotency_key", key)
        },
        label = label,
    )
}
