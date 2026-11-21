package ch.nicolab.cadence.tasks.google

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** État du compte Google côté serveur (`GET /api/v1/google`). */
data class GoogleAccountStatus(
    val configured: Boolean,
    val connected: Boolean,
    val email: String? = null,
    val lastSyncedAt: Instant? = null,
    val lastError: String? = null,
)

/** Issue du retour OAuth depuis le navigateur (`cadence://google?...`). */
sealed interface GoogleOAuthOutcome {
    data object Connected : GoogleOAuthOutcome
    data object Denied : GoogleOAuthOutcome
    data class Error(val message: String?) : GoogleOAuthOutcome
}

object GoogleSyncParser {
    fun status(body: JsonObject): GoogleAccountStatus = GoogleAccountStatus(
        configured = body.bool("configured") ?: false,
        connected = body.bool("connected") ?: false,
        email = body.text("email"),
        lastSyncedAt = body.text("last_synced_at")?.let { raw -> runCatching { Instant.parse(raw) }.getOrNull() },
        lastError = body.text("last_error"),
    )

    fun connectUrl(body: JsonObject): String? = body.text("url")

    private fun JsonObject.bool(key: String): Boolean? =
        (this[key] as? JsonPrimitive)?.booleanOrNull

    private fun JsonObject.text(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.trim()?.ifBlank { null }
}

object GoogleSyncUrls {
    /** Origine du serveur (`scheme://host[:port]`) sans `/api` ni chemin. */
    fun originOf(baseUrl: String): String {
        val trimmed = baseUrl.trim().trimEnd('/')
        val uri = runCatching { URI(trimmed) }.getOrNull()
        val scheme = uri?.scheme?.takeIf { it.isNotBlank() }
        val authority = uri?.rawAuthority?.takeIf { it.isNotBlank() }
        return if (scheme != null && authority != null) "$scheme://$authority" else trimmed
    }

    fun connectPath(baseUrl: String): String {
        val origin = URLEncoder.encode(originOf(baseUrl), Charsets.UTF_8.name())
        return "/api/v1/google/connect?origin=$origin&client=app"
    }
}

object GoogleOAuthReturn {
    private const val SCHEME = "cadence"
    private const val HOST = "google"

    fun parse(uriString: String?): GoogleOAuthOutcome? {
        val raw = uriString?.trim()?.ifBlank { null } ?: return null
        val uri = runCatching { URI(raw) }.getOrNull() ?: return null
        if (!SCHEME.equals(uri.scheme, ignoreCase = true) || !HOST.equals(uri.host, ignoreCase = true)) {
            return null
        }
        val params = parseQuery(uri.rawQuery)
        return when (params["google"]) {
            "connected" -> GoogleOAuthOutcome.Connected
            "denied" -> GoogleOAuthOutcome.Denied
            "error" -> GoogleOAuthOutcome.Error(params["message"]?.trim()?.ifBlank { null })
            else -> null
        }
    }

    private fun parseQuery(rawQuery: String?): Map<String, String> {
        if (rawQuery.isNullOrBlank()) return emptyMap()
        return buildMap {
            for (pair in rawQuery.split('&')) {
                if (pair.isEmpty()) continue
                val eq = pair.indexOf('=')
                val key = decode(if (eq >= 0) pair.substring(0, eq) else pair)
                val value = if (eq >= 0) decode(pair.substring(eq + 1)) else ""
                put(key, value)
            }
        }
    }

    private fun decode(raw: String): String =
        runCatching { URLDecoder.decode(raw, Charsets.UTF_8.name()) }.getOrDefault(raw)
}
