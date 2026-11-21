package ch.nicolab.cadence.tasks.contentlinks

import android.content.SharedPreferences
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.put
import kotlin.coroutines.cancellation.CancellationException

/** Une personne qu'on peut mentionner (`@[Nom](person:uid)`). */
data class MentionPerson(val uid: String, val name: String)

/** Résultat de la liste des personnes assignables, avec l'état en ligne du serveur. */
data class AssignablePeople(val people: List<MentionPerson>, val online: Boolean)

/**
 * Personnes du choix `@` : les personnes ne sont pas synchronisées sur Android, la liste se lit en ligne
 * (`GET /api/v1/people?archived=false`, comme le web) et la dernière lue est gardée sur l'appareil pour écrire une
 * mention hors ligne. Jamais lue : liste vide.
 */
class PeopleClient internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>) -> JsonElement,
    private val prefs: SharedPreferences,
) {
    /** La liste du serveur, ou la dernière gardée si le serveur ne répond pas. */
    suspend fun list(): List<MentionPerson> = try {
        parse(call("GET", "/api/v1/people", mapOf("archived" to "false"))).also { save(KEY, it) }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        cached(KEY)
    }

    /** Personnes assignables à une tâche du projet [projectUid] (ou de l'espace sans projet). */
    suspend fun assignable(projectUid: String?): AssignablePeople {
        val path = if (projectUid != null) "/api/v1/projects/$projectUid/assignable-people" else "/api/v1/people/assignable"
        val cacheKey = "assignable:${projectUid ?: "workspace"}"
        return try {
            val people = parse(call("GET", path, emptyMap())).also { save(cacheKey, it) }
            AssignablePeople(people, online = true)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            AssignablePeople(cached(cacheKey), online = false)
        }
    }

    /** Nom connu localement pour [uid] (dernier cache des personnes), ou null. */
    fun cachedNameOf(uid: String, projectUid: String? = null): String? {
        val keys = listOfNotNull(
            projectUid?.let { "assignable:$it" },
            "assignable:workspace",
            KEY,
        )
        return keys.firstNotNullOfOrNull { key -> cached(key).firstOrNull { it.uid == uid }?.name }
    }

    private fun cached(key: String): List<MentionPerson> = prefs.getString(key, null)?.let { raw ->
        runCatching { parse(Json.parseToJsonElement(raw)) }.getOrNull()
    }.orEmpty()

    private fun save(key: String, people: List<MentionPerson>) {
        val json = buildJsonObject {
            put("people", buildJsonArray { people.forEach { add(buildJsonObject { put("uid", it.uid); put("name", it.name) }) } })
        }
        prefs.edit().putString(key, json.toString()).apply()
    }

    companion object {
        private const val KEY = "people"

        /** Les personnes d'une réponse `{ people: [...] }`, sans celles qui n'ont ni uid ni nom. */
        fun parse(response: JsonElement): List<MentionPerson> {
            val list = ((response as? JsonObject)?.get("people") as? JsonArray).orEmpty()
            return list.mapNotNull { element ->
                val item = element as? JsonObject ?: return@mapNotNull null
                val uid = (item["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                val name = (item["name"] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                MentionPerson(uid, name)
            }
        }

        /** Les personnes dont le nom contient [query] (sans casse), celles qui commencent par lui d'abord. */
        fun matching(people: List<MentionPerson>, query: String, limit: Int = 8): List<MentionPerson> {
            val q = query.trim().lowercase()
            if (q.isEmpty()) return people.take(limit)
            return people.filter { it.name.lowercase().contains(q) }
                .sortedBy { if (it.name.lowercase().startsWith(q)) 0 else 1 }
                .take(limit)
        }
    }
}
