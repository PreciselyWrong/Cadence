package ch.nicolab.cadence.tasks.live

import android.content.Context
import ch.nicolab.cadence.tasks.data.currentServerSession
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

private const val TIMEOUT_MS = 15_000

/** Appel authentifié à l'API du serveur (jeton `tt_`) ; lève [IOException] hors ligne ou sur un code HTTP refusé. */
internal suspend fun liveRequest(context: Context, method: String, path: String): JsonObject = withContext(Dispatchers.IO) {
    val session = currentServerSession(context.applicationContext) ?: throw IOException("Aucun serveur configuré")
    val connection = (URL(session.baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        setRequestProperty("Authorization", "Bearer ${session.token}")
        setRequestProperty("Accept", "application/json")
        if (method == "POST") {
            doOutput = true
            setFixedLengthStreamingMode(0)
        }
    }
    try {
        val code = connection.responseCode
        if (code !in 200..299) throw IOException("HTTP $code")
        val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        runCatching { Json.parseToJsonElement(text).jsonObject }.getOrDefault(JsonObject(emptyMap()))
    } finally {
        connection.disconnect()
    }
}
