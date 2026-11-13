package ch.nicolab.cadence.tasks.proposals

import android.content.Context
import ch.nicolab.cadence.tasks.data.currentServerSession
import ch.nicolab.cadence.tasks.plugins.NotConnected
import ch.nicolab.cadence.tasks.sync.ServerSession
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Réponse hors 2xx de l'API des propositions ; [message] est le `{error}` du serveur. */
class ProposalError(val code: Int, message: String?) : IOException(message ?: "HTTP $code")

/**
 * API des propositions (`backend/modules/proposals/`, `docs/47-proposals.md`), en ligne seulement : rien n'est gardé
 * dans Room. Erreur réseau = [IOException] simple ; réponse du serveur = [ProposalError].
 */
class ProposalsClient(private val session: suspend () -> ServerSession?) {
    suspend fun list(): JsonObject = request("GET", "/api/proposals")

    suspend fun create(kind: ProposalKind): JsonObject =
        request("POST", "/api/proposals", buildJsonObject { put("kind", kind.wire) })

    suspend fun get(uid: String): JsonObject = request("GET", path(uid))

    suspend fun reply(uid: String, text: String): JsonObject =
        request("POST", path(uid) + "/reply", buildJsonObject { put("text", text) })

    suspend fun apply(uid: String, body: JsonObject): JsonObject = request("POST", path(uid) + "/apply", body)

    suspend fun dismiss(uid: String): JsonObject = request("POST", path(uid) + "/dismiss", EMPTY)

    private fun path(uid: String) = "/api/proposals/" + URLEncoder.encode(uid, "UTF-8")

    private suspend fun request(method: String, path: String, body: JsonObject? = null): JsonObject = withContext(Dispatchers.IO) {
        val server = session() ?: throw NotConnected()
        val connection = (URL(server.baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${server.token}")
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            if (code !in 200..299) {
                val text = runCatching { connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } }.getOrNull()
                throw ProposalError(code, errorOf(text))
            }
            parse(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }) ?: JsonObject(emptyMap())
        } finally {
            connection.disconnect()
        }
    }

    private fun parse(text: String?): JsonObject? = text?.let { runCatching { ProposalJson.parseToJsonElement(it).jsonObject }.getOrNull() }

    private fun errorOf(text: String?): String? = (parse(text)?.get("error") as? JsonPrimitive)?.content

    private companion object {
        const val TIMEOUT_MS = 15_000
        val EMPTY = JsonObject(emptyMap())
    }
}

internal fun proposalsClient(context: Context): ProposalsClient {
    val app = context.applicationContext
    return ProposalsClient { currentServerSession(app) }
}
