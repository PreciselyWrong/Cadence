package ch.nicolab.cadence.tasks.google

import ch.nicolab.cadence.tasks.plugins.NotConnected
import ch.nicolab.cadence.tasks.sync.ServerSession
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** Client en ligne pour l'état et la reconnexion Google côté serveur (`/api/v1/google`). */
class GoogleSyncClient(private val session: suspend () -> ServerSession?) {
    suspend fun status(): Result<GoogleAccountStatus> = attempt {
        GoogleSyncParser.status(get("/api/v1/google"))
    }

    suspend fun connectUrl(): Result<String> = attempt {
        val server = session() ?: throw NotConnected()
        val body = get(GoogleSyncUrls.connectPath(server.baseUrl), server)
        GoogleSyncParser.connectUrl(body) ?: throw IOException("Adresse de connexion Google absente")
    }

    private suspend fun get(path: String, givenServer: ServerSession? = null): JsonObject =
        withContext(Dispatchers.IO) {
            val server = givenServer ?: session() ?: throw NotConnected()
            val url = URL(server.baseUrl.trimEnd('/') + path)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Authorization", "Bearer ${server.token}")
                setRequestProperty("Accept", "application/json")
            }
            try {
                val code = connection.responseCode
                if (code !in 200..299) {
                    val text = runCatching {
                        connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                    }.getOrNull()
                    val errorMessage = (parse(text)["error"] as? JsonPrimitive)?.contentOrNull
                    throw IOException(errorMessage ?: "HTTP $code")
                }
                val body = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                parse(body)
            } finally {
                connection.disconnect()
            }
        }

    private fun parse(text: String?): JsonObject =
        if (text.isNullOrBlank()) {
            JsonObject(emptyMap())
        } else {
            runCatching { Json.parseToJsonElement(text).jsonObject }.getOrDefault(JsonObject(emptyMap()))
        }

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (t: Throwable) {
        Result.failure(t)
    }

    companion object {
        private const val TIMEOUT_MS = 15_000
    }
}
