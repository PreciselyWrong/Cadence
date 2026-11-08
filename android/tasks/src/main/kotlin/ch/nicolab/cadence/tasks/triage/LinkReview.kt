package ch.nicolab.cadence.tasks.triage

import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Type d'un lien à revoir proposé par la file « À trier » (`review_link`). */
const val LINK_REVIEW_TYPE = "link_review"

/** Décision sur un lien à revoir, telle que `POST /api/v1/triage/links/:uid/review` la reçoit. */
enum class LinkReviewDecision(val wire: String) {
    /** Plus de jour de revue : le lien reste. */
    KEEP("keep"),

    /** Le lien passe en archivé. */
    ARCHIVE("archive"),

    /** Revu de nouveau dans 30 jours. */
    LATER("later"),
}

/** Carte « Lien à revoir » : le lien, son titre s'il en a un, et son adresse. */
data class LinkReviewCard(val linkUid: String, val title: String?, val url: String)

/** Lecture tolérante de la charge utile : une forme inconnue donne null, jamais une exception. */
object LinkReviewPayload {
    fun parse(payload: JsonObject?): LinkReviewCard? {
        payload ?: return null
        val linkUid = text(payload, "link_uid") ?: return null
        val url = text(payload, "url") ?: return null
        return LinkReviewCard(linkUid = linkUid, title = text(payload, "title"), url = url)
    }

    private fun text(source: JsonObject, key: String): String? =
        (source[key] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)
}

/** Appels de la file « À trier » pour un lien à revoir : une décision par lien, rejouée hors ligne. */
internal object LinkReviewRequests {
    fun decide(linkUid: String, decision: LinkReviewDecision, label: String) = DeferredCall(
        key = "triage-link-review:$linkUid",
        method = "POST",
        path = "/api/v1/triage/links/$linkUid/review",
        body = buildJsonObject { put("decision", decision.wire) },
        label = label,
    )
}
