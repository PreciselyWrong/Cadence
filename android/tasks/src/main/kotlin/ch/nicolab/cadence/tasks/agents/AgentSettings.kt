package ch.nicolab.cadence.tasks.agents

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

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
class AgentsRepository internal constructor(
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
