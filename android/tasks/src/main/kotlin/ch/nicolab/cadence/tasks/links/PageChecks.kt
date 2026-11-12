package ch.nicolab.cadence.tasks.links

import java.net.URLEncoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/** État d'une page vérifiée par le serveur : `ok`, `dead` (404, 410 ou hôte injoignable), sinon `unknown`. */
enum class PageState {
    OK, DEAD, UNKNOWN;

    companion object {
        fun fromWire(value: String?): PageState = when (value) {
            "ok" -> OK
            "dead" -> DEAD
            else -> UNKNOWN
        }
    }
}

/** Résultat de « Vérifier les pages » pour une page ; [code] est le statut HTTP, null quand l'hôte ne répond pas. */
data class PageCheck(val uid: String, val url: String, val state: PageState, val code: Int?)

/** Lecture tolérante de `POST /api/v1/projects/:uid/pages/check` : une ligne de forme inconnue est ignorée. */
object PageChecks {
    fun parse(response: JsonObject): List<PageCheck> {
        val rows = response["results"] as? JsonArray ?: return emptyList()
        return rows.mapNotNull { element ->
            val row = element as? JsonObject ?: return@mapNotNull null
            val uid = row.text("uid") ?: return@mapNotNull null
            val url = row.text("url") ?: return@mapNotNull null
            PageCheck(uid, url, PageState.fromWire(row.text("state")), (row["code"] as? JsonPrimitive)?.intOrNull)
        }
    }

    fun dead(results: List<PageCheck>): List<PageCheck> = results.filter { it.state == PageState.DEAD }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
}

/**
 * Appel en ligne de « Vérifier les pages » : rien n'est supprimé côté serveur ni ici. Hors ligne, l'appel échoue
 * et l'écran le dit.
 */
class PageCheckClient internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
) {
    suspend fun check(projectUid: String): Result<List<PageCheck>> = runCatching {
        val uid = URLEncoder.encode(projectUid, "UTF-8").replace("+", "%20")
        PageChecks.parse(call("POST", "/api/v1/projects/$uid/pages/check", emptyMap(), null))
    }
}
