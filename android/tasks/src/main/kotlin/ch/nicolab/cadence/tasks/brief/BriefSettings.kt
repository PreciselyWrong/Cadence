package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.sync.DeferredCall
import ch.nicolab.cadence.tasks.sync.HttpError
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Ordre par défaut des sections du brief (`docs/39-daily-brief.md`, Réglages). */
val DEFAULT_BRIEF_SECTIONS = listOf("verdict", "timeline", "tonight", "moves", "anticipate", "replies", "inbox", "resolved")

/**
 * Réglages du brief, lus et écrits tels que le serveur les normalise (`GET`/`PUT /daily-plan/brief/settings`). L'objet
 * complet est gardé et renvoyé : le serveur refuse les clés inconnues, et une écriture hors ligne remplace la précédente.
 */
class BriefSettingsRepository internal constructor(
    private val store: BriefStore,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val defer: suspend (DeferredCall) -> Unit,
) {
    /** Dernière lecture (ou dernière écriture) : affichée hors ligne. */
    val settings: StateFlow<JsonObject?> = store.settings

    /** Relit les réglages du serveur et garde la lecture ; échec hors ligne, la lecture gardée reste affichée. */
    suspend fun refresh(): Result<JsonObject> = runCatchingIo {
        val fresh = call("GET", PATH, emptyMap(), null)
        store.writeSettings(fresh)
        fresh
    }

    /**
     * Écrit [next] : gardé tout de suite, envoyé au serveur ; sans réseau ou si le serveur est en panne, l'écriture part
     * au prochain passage de synchro. Un refus du serveur (valeur invalide) est rendu et la lecture précédente revient.
     */
    suspend fun save(next: JsonObject): Result<JsonObject> {
        val previous = store.settings.value
        store.writeSettings(next)
        return try {
            val saved = call("PUT", PATH, emptyMap(), next)
            store.writeSettings(saved)
            Result.success(saved)
        } catch (error: CancellationException) {
            throw error
        } catch (error: HttpError) {
            // Refus du serveur : on revient à la lecture gardée. Panne passagère : l'écriture part plus tard.
            if (error.isClientError) {
                if (previous != null) store.writeSettings(previous)
                Result.failure(error)
            } else {
                defer(BriefRequests.settings(next))
                Result.success(next)
            }
        } catch (_: IOException) {
            defer(BriefRequests.settings(next))
            Result.success(next)
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    /** État des sources (`GET /daily-plan/brief/status`) ; en ligne seulement. */
    suspend fun status(): Result<JsonObject> = runCatchingIo { call("GET", STATUS_PATH, emptyMap(), null) }

    private companion object {
        const val PATH = "/api/v1/daily-plan/brief/settings"
        const val STATUS_PATH = "/api/v1/daily-plan/brief/status"
    }
}

/** Lecture typée des réglages et de leurs modifications : chaque écriture rend un nouvel objet, l'ancien reste intact. */
object BriefSettingsJson {
    fun bool(settings: JsonObject, key: String): Boolean = (settings[key] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.content == "true"

    fun string(settings: JsonObject, key: String): String = (settings[key] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.content.orEmpty()

    fun int(settings: JsonObject, key: String, default: Int): Int =
        (settings[key] as? JsonPrimitive)?.content?.toIntOrNull() ?: default

    fun group(settings: JsonObject, key: String): JsonObject = settings[key] as? JsonObject ?: JsonObject(emptyMap())

    fun sections(settings: JsonObject): List<String> =
        (settings["sections"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }?.takeIf { it.isNotEmpty() } ?: DEFAULT_BRIEF_SECTIONS

    fun withValue(settings: JsonObject, key: String, value: JsonElement): JsonObject = JsonObject(settings + (key to value))

    /** Remplace une clé d'un sous-objet, les autres clés du sous-objet sont gardées. */
    fun withNested(settings: JsonObject, group: String, key: String, value: JsonElement): JsonObject =
        withValue(settings, group, JsonObject(group(settings, group) + (key to value)))

    /** Remplace le sous-objet d'un jour de la semaine (`capacity.evening`, `capacity.dayNotes`) ; null le retire. */
    fun withWeekday(settings: JsonObject, group: String, nested: String, weekday: Int, value: JsonElement?): JsonObject {
        val inner = group(group(settings, group), nested).toMutableMap()
        if (value == null) inner.remove(weekday.toString()) else inner[weekday.toString()] = value
        return withValue(settings, group, JsonObject(group(settings, group) + (nested to JsonObject(inner))))
    }

    fun withSections(settings: JsonObject, sections: List<String>): JsonObject =
        withValue(settings, "sections", JsonArray(sections.map { JsonPrimitive(it) }))

    fun eveningWindow(settings: JsonObject, weekday: Int): BriefEvening? {
        val raw = group(group(settings, "capacity"), "evening")[weekday.toString()] as? JsonObject ?: return null
        val start = (raw["start"] as? JsonPrimitive)?.content ?: return null
        val end = (raw["end"] as? JsonPrimitive)?.content ?: return null
        val minutes = (raw["minutes"] as? JsonPrimitive)?.content?.toIntOrNull() ?: return null
        return BriefEvening(start, end, minutes)
    }

    fun dayNote(settings: JsonObject, weekday: Int): String? =
        (group(group(settings, "capacity"), "dayNotes")[weekday.toString()] as? JsonPrimitive)?.content?.takeIf { it.isNotBlank() }

    /** Jours de la semaine (0 = dimanche) des réglages, pour le créneau du soir et les notes de jour. */
    fun weekdayIndex(day: java.time.DayOfWeek): Int = day.value % 7
}

/** Créneau du soir d'un jour de la semaine : heures « HH:mm » et minutes disponibles. */
data class BriefEvening(val start: String, val end: String, val minutes: Int)

/** Réglages de l'agent (Hermes) : adresse, délai, profils ; la clé n'est jamais relue, seulement ses 4 derniers caractères. */
@Serializable
data class AgentSettingsDto(
    val baseUrl: String = "",
    val timeoutSeconds: Int = 120,
    val profiles: AgentProfilesDto = AgentProfilesDto(),
    val api_key_set: Boolean = false,
    val api_key_last4: String? = null,
)

@Serializable
data class AgentProfilesDto(val mail: String = "")

/** Résultat de `POST /agents/test` : chaque valeur est `ok`, `error`, `unauthorized` ou `missing`. */
@Serializable
data class AgentTestDto(
    val health: String = "error",
    val auth: String = "error",
    val profiles: Map<String, String> = emptyMap(),
)

/** Client des réglages de l'agent ; en ligne seulement (la clé ne se garde pas sur l'appareil). */
class BriefAgentsRepository internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
) {
    suspend fun read(): Result<AgentSettingsDto> = runCatchingIo { json.decodeFromJsonElement(AgentSettingsDto.serializer(), call("GET", SETTINGS, emptyMap(), null)) }

    /**
     * Écrit l'adresse, le délai et les profils. [apiKey] : null ne change pas la clé, une chaîne vide la retire,
     * une valeur la remplace (elle n'est jamais relue).
     */
    suspend fun save(baseUrl: String, timeoutSeconds: Int, profiles: AgentProfilesDto, apiKey: String?): Result<AgentSettingsDto> =
        runCatchingIo {
            val body = buildJsonObject {
                put("baseUrl", baseUrl)
                put("timeoutSeconds", timeoutSeconds)
                put("profiles", buildJsonObject {
                    put("mail", profiles.mail)
                })
                apiKey?.let { put("api_key", if (it.isEmpty()) JsonNull else JsonPrimitive(it)) }
            }
            json.decodeFromJsonElement(AgentSettingsDto.serializer(), call("PUT", SETTINGS, emptyMap(), body))
        }

    suspend fun test(): Result<AgentTestDto> = runCatchingIo {
        json.decodeFromJsonElement(AgentTestDto.serializer(), call("POST", TEST, emptyMap(), JsonObject(emptyMap())))
    }

    private companion object {
        val json = Json { ignoreUnknownKeys = true }
        const val SETTINGS = "/api/v1/agents/settings"
        const val TEST = "/api/v1/agents/test"
    }
}

/** Exécute [block] ; une erreur réseau ou de forme devient un échec ; l'annulation remonte. */
private inline fun <T> runCatchingIo(block: () -> T): Result<T> = try {
    Result.success(block())
} catch (error: CancellationException) {
    throw error
} catch (error: Exception) {
    Result.failure(error)
}
