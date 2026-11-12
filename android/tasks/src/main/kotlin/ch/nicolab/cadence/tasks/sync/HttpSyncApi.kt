package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.domain.QuietHours
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * Client HTTP du protocole de sync, sans dépendance : `HttpURLConnection`.
 * [session] est relue à chaque requête, pour suivre une reconnexion.
 */
class HttpSyncApi(private val session: suspend () -> ServerSession) : SyncApi {

    override suspend fun meta(): JsonObject = request("GET", "/api/v1/sync/meta")

    override suspend fun profile(): AccountProfile = profileOf(request("GET", "/api/v1/profile"))

    override suspend fun snapshot(entity: String, after: Long, cursor: Long?, limit: Int): SnapshotPage {
        val query = buildMap {
            put("entity", entity)
            put("after", after.toString())
            put("limit", limit.toString())
            cursor?.let { put("cursor", it.toString()) }
        }
        return snapshotPageOf(request("GET", "/api/v1/sync/snapshot", query))
    }

    override suspend fun pull(cursor: Long, limit: Int): PullPage = pullPageOf(
        request(
            "GET",
            "/api/v1/sync/pull",
            mapOf("cursor" to cursor.toString(), "limit" to limit.toString()),
        ),
    )

    override suspend fun push(ops: List<JsonObject>): List<PushResult> {
        val body = JsonObject(mapOf("ops" to JsonArray(ops)))
        return pushResultsOf(request("POST", "/api/v1/sync/push", body = body))
    }

    override suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String) {
        val call = moveOccurrenceCall(uid, scope, occurrenceDate, dueDate)
        request(call.method, call.path, body = call.body)
    }

    override suspend fun send(method: String, path: String, body: JsonObject?): JsonObject =
        request(method, path, body = body)

    /** Métadonnées d'une page (titre, image, description) : le serveur la lit, jamais l'appareil. */
    internal suspend fun linkMetadata(url: String): JsonObject = request("GET", "/api/url/title", mapOf("url" to url))

    /** Appel direct à l'API (revue) : en ligne seulement, mêmes erreurs que la synchronisation. */
    internal suspend fun call(method: String, path: String, query: Map<String, String> = emptyMap(), body: JsonObject? = null): JsonObject =
        request(method, path, query, body)

    /** Comme [call], pour une réponse qui peut être une liste (rétroliens). */
    internal suspend fun callJson(method: String, path: String, query: Map<String, String> = emptyMap()): JsonElement =
        shaped { Json.parseToJsonElement(requestText(method, path, query, null)) }

    /**
     * Copie une réponse binaire (MP3 du résumé) dans [target], avec la clé API de l'appareil. Le fichier s'écrit
     * d'abord à côté ([target].part) : un échec ne laisse jamais un fichier tronqué sous le nom final.
     */
    internal suspend fun download(path: String, target: File, maxBytes: Long): Unit = withContext(Dispatchers.IO) {
        val server = session()
        val connection = (URL(server.baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = TIMEOUT_MS
            readTimeout = DOWNLOAD_READ_TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${server.token}")
            setRequestProperty("Accept", "audio/mpeg")
        }
        val part = File(target.parentFile, target.name + ".part")
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                val errorBody = runCatching { connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } }.getOrNull()
                throw httpFailure(code, errorBody)
            }
            var count = 0L
            connection.inputStream.use { input ->
                part.outputStream().use { output ->
                    val buffer = ByteArray(DOWNLOAD_BUFFER)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        count += n
                        if (count > maxBytes) throw IOException("Fichier audio trop volumineux")
                        output.write(buffer, 0, n)
                    }
                }
            }
            if (count == 0L) throw IOException("Fichier audio vide")
            if (!part.renameTo(target)) throw IOException("Impossible d'enregistrer le fichier audio")
        } finally {
            part.delete()
            connection.disconnect()
        }
    }

    private suspend fun request(
        method: String,
        path: String,
        query: Map<String, String> = emptyMap(),
        body: JsonObject? = null,
    ): JsonObject = parseResponse(requestText(method, path, query, body))

    private suspend fun requestText(
        method: String,
        path: String,
        query: Map<String, String>,
        body: JsonObject?,
    ): String = withContext(Dispatchers.IO) {
        val server = session()
        val queryString = query.entries.joinToString("&") { (key, value) -> "${encode(key)}=${encode(value)}" }
        val url = URL(server.baseUrl + path + if (queryString.isEmpty()) "" else "?$queryString")
        val connection = (url.openConnection() as HttpURLConnection).apply {
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
            if (body != null) {
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            if (code !in 200..299) {
                val errorBody = runCatching { connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } }.getOrNull()
                throw httpFailure(code, errorBody)
            }
            connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    private companion object {
        const val TIMEOUT_MS = 15_000
        const val DOWNLOAD_READ_TIMEOUT_MS = 60_000
        const val DOWNLOAD_BUFFER = 65_536
    }
}

/**
 * Toutes les réponses sont des objets JSON : un corps qui n'en est pas un (page HTML d'un proxy,
 * liste, texte) devient une [ProtocolError].
 */
internal fun parseResponse(text: String): JsonObject = shaped { Json.parseToJsonElement(text).jsonObject }

/**
 * Erreur d'une réponse hors 2xx. Un 410 `reset_required` du pull dit que le journal compacté ne remonte plus
 * jusqu'au curseur : l'appareil doit reprendre un instantané.
 */
internal fun httpFailure(code: Int, body: String?): Exception = when {
    code == HttpURLConnection.HTTP_UNAUTHORIZED || code == HttpURLConnection.HTTP_FORBIDDEN ->
        AuthError("Clé API refusée ($code)")
    code == HttpURLConnection.HTTP_GONE && errorCodeOf(body) == "reset_required" -> ResetRequired()
    else -> HttpError(code, errorCodeOf(body))
}

/** `error` d'un corps d'erreur JSON ; null pour une page HTML ou un corps vide. Borné : il finit dans un message. */
private fun errorCodeOf(body: String?): String? = body?.let {
    runCatching { (Json.parseToJsonElement(it).jsonObject["error"] as? JsonPrimitive)?.contentOrNull }.getOrNull()
}?.take(80)

internal fun profileOf(fields: JsonObject): AccountProfile = shaped {
    AccountProfile(
        email = (fields["email"] as? JsonPrimitive)?.contentOrNull,
        uid = (fields["uid"] as? JsonPrimitive)?.contentOrNull,
        timezone = (fields["timezone"] as? JsonPrimitive)?.contentOrNull,
        firstDayOfWeek = (fields["first_day_of_week"] as? JsonPrimitive)?.intOrNull,
        quietHours = (fields["quiet_hours"] as? JsonObject)?.let { quiet ->
            QuietHours.parse(
                enabled = (quiet["enabled"] as? JsonPrimitive)?.booleanOrNull == true,
                start = (quiet["start"] as? JsonPrimitive)?.contentOrNull,
                end = (quiet["end"] as? JsonPrimitive)?.contentOrNull,
            )
        },
    )
}

internal fun snapshotPageOf(fields: JsonObject): SnapshotPage = shaped {
    SnapshotPage(
        cursor = fields.long("cursor"),
        next = (fields["next"] as? JsonPrimitive)?.longOrNull,
        rows = fields.array("rows").map { it.jsonObject },
    )
}

internal fun pullPageOf(fields: JsonObject): PullPage = shaped {
    PullPage(
        cursor = fields.long("cursor"),
        hasMore = fields.getValue("has_more").jsonPrimitive.booleanOrNull == true,
        changes = fields.array("changes").map { element ->
            val change = element.jsonObject
            RemoteChange(
                seq = change.long("seq"),
                entity = change.string("entity"),
                uid = change.string("uid"),
                op = change.string("op"),
                data = change["data"] as? JsonObject,
                opId = (change["op_id"] as? JsonPrimitive)?.contentOrNull,
            )
        },
    )
}

internal fun pushResultsOf(fields: JsonObject): List<PushResult> = shaped {
    fields.array("results").map { element ->
        val result = element.jsonObject
        PushResult(
            opId = result.string("op_id"),
            status = result.string("status"),
            reason = (result["reason"] as? JsonPrimitive)?.contentOrNull,
            rejectedFields = (result["rejected_fields"] as? JsonArray)
                ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                .orEmpty(),
        )
    }
}

/**
 * Lit une réponse dont la forme est attendue : toute erreur de lecture (clé absente, mauvais type,
 * JSON invalide) devient une [ProtocolError] au lieu de faire planter l'appelant.
 */
private inline fun <T> shaped(read: () -> T): T = try {
    read()
} catch (error: RuntimeException) {
    throw ProtocolError(error)
}

private fun JsonObject.long(key: String): Long = getValue(key).jsonPrimitive.longOrNull
    ?: throw ProtocolError()

private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.content

private fun JsonObject.array(key: String) = this[key]?.jsonArray ?: JsonArray(emptyList())
