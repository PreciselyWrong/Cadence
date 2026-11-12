package ch.nicolab.cadence.tasks.contentlinks

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull

/** Une note ou une tâche qui pointe vers l'élément ouvert (`docs/44-notes-links.md`, « Rétroliens »). */
data class Backlink(val type: String, val uid: String, val title: String, val snippet: String?)

/**
 * Rétroliens lus en ligne (`GET /api/v1/note|task/:uid/backlinks`) : le serveur les calcule à la lecture depuis le
 * texte déjà synchronisé, rien n'est gardé sur l'appareil. Hors ligne ou en erreur : aucune section.
 */
class BacklinksClient internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>) -> JsonElement,
) {
    suspend fun of(type: String, uid: String): List<Backlink> = parse(call("GET", "/api/v1/$type/$uid/backlinks", emptyMap()))

    companion object {
        /** Les rétroliens d'une réponse ; une entrée sans type connu, uid ou titre est ignorée. */
        fun parse(response: JsonElement): List<Backlink> = (response as? JsonArray).orEmpty().mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            fun field(key: String) = (item[key] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull
            val type = field("type")?.takeIf { it == "note" || it == "task" } ?: return@mapNotNull null
            val uid = field("uid") ?: return@mapNotNull null
            Backlink(type, uid, field("title").orEmpty().ifBlank { return@mapNotNull null }, field("snippet")?.takeIf { it.isNotBlank() })
        }
    }
}
