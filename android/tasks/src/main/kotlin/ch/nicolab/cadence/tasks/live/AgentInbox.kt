package ch.nicolab.cadence.tasks.live

import android.content.Context
import android.util.Log
import ch.nicolab.cadence.tasks.data.currentServerSession
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** Message non lu d'un agent : une notification posée par un plugin (`data.pluginId`). */
data class AgentMessage(
    val uid: String,
    val title: String,
    val createdAt: String,
    val openPath: String?,
)

/** Ce que montre le bandeau : le plus récent, et combien d'autres attendent. */
data class AgentBanner(val latest: AgentMessage, val more: Int)

/** Règles du bandeau, pures (`docs/46-plugins.md`, Notifications ; même lecture que le web `agentMessagesService.ts`). */
object AgentMessages {
    /** Réponse de `GET /api/notifications` : seulement celles d'un plugin, la plus récente en premier. */
    fun pick(body: JsonObject): List<AgentMessage> =
        (body["notifications"] as? JsonArray).orEmpty()
            .mapNotNull { element ->
                val item = element as? JsonObject ?: return@mapNotNull null
                val data = item["data"] as? JsonObject ?: return@mapNotNull null
                data.text("pluginId") ?: return@mapNotNull null
                AgentMessage(
                    uid = item.text("uid") ?: return@mapNotNull null,
                    title = item.text("title") ?: return@mapNotNull null,
                    createdAt = item.text("created_at").orEmpty(),
                    openPath = data.text("openPath"),
                )
            }
            .sortedByDescending { it.createdAt }

    fun banner(messages: List<AgentMessage>): AgentBanner? =
        messages.firstOrNull()?.let { AgentBanner(it, messages.size - 1) }

    /** « Ouvrir » n'est proposé que si le message mène à la page d'un plugin (chemin interne vérifié). */
    fun pluginTarget(message: AgentMessage): LiveTarget.Plugin? = LiveTarget.of(message.openPath, null) as? LiveTarget.Plugin

    private fun JsonObject.text(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.ifBlank { null }
}

/**
 * Messages non lus des agents, lus en ligne : au retour au premier plan, après chaque synchro et à chaque event du
 * flux live. Hors ligne ou en erreur, la liste est vide et le bandeau disparaît.
 */
object AgentInbox {
    private const val TAG = "AgentInbox"
    private const val LIST_PATH = "/api/notifications?includeRead=false&limit=20"
    private const val TIMEOUT_MS = 15_000

    private val _messages = MutableStateFlow<List<AgentMessage>>(emptyList())
    val messages: StateFlow<List<AgentMessage>> = _messages.asStateFlow()

    suspend fun refresh(context: Context) {
        _messages.value = try {
            val body = request(context, "GET", LIST_PATH)
            AgentMessages.pick(body)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.i(TAG, "Agent messages not read", error)
            emptyList()
        }
    }

    /** Retire le message aussitôt, puis le marque lu ; vrai si le serveur l'a noté. */
    suspend fun markRead(context: Context, uid: String): Boolean {
        _messages.update { list -> list.filterNot { it.uid == uid } }
        return try {
            request(context, "POST", "/api/notifications/" + URLEncoder.encode(uid, "UTF-8") + "/read")
            true
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Agent message not marked read", error)
            false
        }
    }

    private suspend fun request(context: Context, method: String, path: String): JsonObject = withContext(Dispatchers.IO) {
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
}
