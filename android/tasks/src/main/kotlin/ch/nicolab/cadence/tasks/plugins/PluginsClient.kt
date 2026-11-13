package ch.nicolab.cadence.tasks.plugins

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import ch.nicolab.cadence.tasks.data.currentServerSession
import ch.nicolab.cadence.tasks.sync.ServerSession
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Réponse hors 2xx de l'API des plugins ; [message] est le `{error}` du serveur, tel quel, s'il y en a un. */
class PluginError(val code: Int, message: String?) : IOException(message ?: "HTTP $code") {
    /** Le compte n'est pas administrateur : l'écran des plugins ne le concerne pas. */
    val forbidden: Boolean get() = code == HttpURLConnection.HTTP_FORBIDDEN
}

/** Aucun serveur configuré sur cet appareil. */
class NotConnected : IOException("Aucun serveur configuré")

/**
 * API des plugins (`backend/modules/plugins/`), en ligne seulement : ce sont des réglages du serveur, rien n'est
 * gardé dans Room ni synchronisé. Client à part du client de synchro pour garder le message d'erreur entier du
 * serveur (y compris sur un 403) et pour donner adresse et jeton à la page d'un plugin.
 */
class PluginsClient(private val session: suspend () -> ServerSession?) {
    suspend fun server(): ServerSession = session() ?: throw NotConnected()

    suspend fun list(): Result<PluginList> = attempt { PluginJson.list(request("GET", "/api/plugins")) }

    suspend fun menu(): Result<PluginMenu> = attempt { PluginJson.menu(request("GET", "/api/plugins/menu")) }

    suspend fun setEnabled(id: String, enabled: Boolean): Result<Unit> =
        unit { request("PATCH", plugin(id), buildJsonObject { put("enabled", enabled) }) }

    suspend fun saveSettings(id: String, settings: JsonObject): Result<Unit> =
        unit { request("PATCH", plugin(id), buildJsonObject { put("settings", settings) }) }

    suspend fun reload(id: String): Result<Unit> = unit { request("POST", plugin(id) + "/reload", EMPTY) }

    suspend fun reloadAll(): Result<Unit> = unit { request("POST", "/api/plugins/reload", EMPTY) }

    suspend fun pull(id: String): Result<Unit> = unit { request("POST", plugin(id) + "/pull", EMPTY) }

    suspend fun checkUpdate(id: String): Result<Unit> = unit { request("POST", plugin(id) + "/check-update", EMPTY) }

    suspend fun remove(id: String): Result<Unit> = unit { request("DELETE", plugin(id)) }

    suspend fun install(url: String): Result<Unit> =
        unit { request("POST", "/api/plugins/install", buildJsonObject { put("url", url.trim()) }) }

    private fun plugin(id: String) = "/api/plugins/" + URLEncoder.encode(id, "UTF-8")

    private suspend fun request(method: String, path: String, body: JsonObject? = null): JsonObject = withContext(Dispatchers.IO) {
        val server = server()
        val connection = (URL(server.baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = TIMEOUT_MS
            // Ajouter ou mettre à jour depuis Git clone ou tire un dépôt : plus long qu'un appel ordinaire.
            readTimeout = if (path.endsWith("/install") || path.endsWith("/pull")) GIT_TIMEOUT_MS else TIMEOUT_MS
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
                throw PluginError(code, PluginJson.error(parse(text)))
            }
            parse(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }) ?: JsonObject(emptyMap())
        } finally {
            connection.disconnect()
        }
    }

    private fun parse(text: String?): JsonObject? = text?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() }

    private suspend fun unit(block: suspend () -> Unit): Result<Unit> = attempt(block)

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    private companion object {
        const val TIMEOUT_MS = 15_000
        const val GIT_TIMEOUT_MS = 120_000
        val EMPTY = JsonObject(emptyMap())
    }
}

/**
 * Dernières réponses gardées : le menu des plugins, pour l'afficher hors ligne, et si le compte peut gérer les
 * plugins, pour ne pas faire clignoter la rubrique de Réglages à chaque ouverture.
 */
class PluginsStore private constructor(private val prefs: SharedPreferences) {
    fun menu(): PluginMenu = prefs.getString(KEY_MENU, null)
        ?.let { runCatching { PluginJson.menu(Json.parseToJsonElement(it).jsonObject) }.getOrNull() }
        ?: PluginMenu.EMPTY

    fun saveMenu(menu: PluginMenu) {
        prefs.edit { putString(KEY_MENU, PluginJson.menuBody(menu).toString()) }
    }

    fun admin(): Boolean = prefs.getBoolean(KEY_ADMIN, false)

    fun saveAdmin(value: Boolean) {
        prefs.edit { putBoolean(KEY_ADMIN, value) }
    }

    companion object {
        private const val PREFS = "plugins"
        private const val KEY_MENU = "menu"
        private const val KEY_ADMIN = "admin"

        fun of(context: Context) = PluginsStore(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
    }
}

fun pluginsClient(context: Context): PluginsClient {
    val app = context.applicationContext
    return PluginsClient { currentServerSession(app) }
}
