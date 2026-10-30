package ch.nicolab.cadence.tasks.sync

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
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Client HTTP du protocole de sync, sans dépendance : `HttpURLConnection`.
 * [session] est relue à chaque requête, pour suivre une reconnexion.
 */
class HttpSyncApi(private val session: suspend () -> ServerSession) : SyncApi {

    override suspend fun meta(): JsonObject = request("GET", "/api/v1/sync/meta").jsonObject

    override suspend fun profile(): AccountProfile {
        val body = request("GET", "/api/v1/profile").jsonObject
        return AccountProfile(
            email = (body["email"] as? JsonPrimitive)?.contentOrNull,
            timezone = (body["timezone"] as? JsonPrimitive)?.contentOrNull,
        )
    }

    override suspend fun snapshot(entity: String, after: Long, cursor: Long?, limit: Int): SnapshotPage {
        val query = buildMap {
            put("entity", entity)
            put("after", after.toString())
            put("limit", limit.toString())
            cursor?.let { put("cursor", it.toString()) }
        }
        val body = request("GET", "/api/v1/sync/snapshot", query).jsonObject
        return SnapshotPage(
            cursor = body.long("cursor"),
            next = (body["next"] as? JsonPrimitive)?.longOrNull,
            rows = body.array("rows").map { it.jsonObject },
        )
    }

    override suspend fun pull(cursor: Long, limit: Int): PullPage {
        val body = request(
            "GET",
            "/api/v1/sync/pull",
            mapOf("cursor" to cursor.toString(), "limit" to limit.toString()),
        ).jsonObject
        return PullPage(
            cursor = body.long("cursor"),
            hasMore = body.getValue("has_more").jsonPrimitive.booleanOrNull == true,
            changes = body.array("changes").map { element ->
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

    override suspend fun push(ops: List<JsonObject>): List<PushResult> {
        val body = JsonObject(mapOf("ops" to JsonArray(ops)))
        return request("POST", "/api/v1/sync/push", body = body).jsonObject.array("results").map { element ->
            val result = element.jsonObject
            PushResult(
                opId = result.string("op_id"),
                status = result.string("status"),
                reason = (result["reason"] as? JsonPrimitive)?.contentOrNull,
            )
        }
    }

    override suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String) {
        val body = JsonObject(
            mapOf(
                "scope" to JsonPrimitive(scope),
                "occurrence_date" to JsonPrimitive(occurrenceDate),
                "due_date" to JsonPrimitive(dueDate),
            ),
        )
        request("POST", "/api/v1/task/${encode(uid)}/move-occurrence", body = body)
    }

    private suspend fun request(
        method: String,
        path: String,
        query: Map<String, String> = emptyMap(),
        body: JsonObject? = null,
    ): JsonElement = withContext(Dispatchers.IO) {
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
            if (code == HttpURLConnection.HTTP_UNAUTHORIZED || code == HttpURLConnection.HTTP_FORBIDDEN) {
                throw AuthError("Clé API refusée ($code)")
            }
            if (code !in 200..299) throw IOException("HTTP $code")
            val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            Json.parseToJsonElement(text)
        } finally {
            connection.disconnect()
        }
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun JsonObject.long(key: String): Long = getValue(key).jsonPrimitive.longOrNull
        ?: throw IOException("Réponse invalide : $key")

    private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.content

    private fun JsonObject.array(key: String) = this[key]?.jsonArray ?: JsonArray(emptyList())

    private companion object {
        const val TIMEOUT_MS = 15_000
    }
}
