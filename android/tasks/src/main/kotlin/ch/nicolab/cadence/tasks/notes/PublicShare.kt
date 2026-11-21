package ch.nicolab.cadence.tasks.notes

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** État du partage public d'une note (`GET/POST/DELETE /api/v1/note/:uid/public-share`). */
data class PublicShareState(
    val enabled: Boolean,
    val token: String?,
    val sharedAt: String?,
    val inheritStyle: Boolean = true,
) {
    /** Adresse publique complète pour le serveur connecté, ou null s'il n'y a pas de jeton. */
    fun publicUrl(baseUrl: String): String? =
        token?.takeIf { it.isNotBlank() }?.let { "${baseUrl.trimEnd('/')}/public/notes/$it" }
}

/**
 * Client en ligne pour le partage public des notes et la lecture du drapeau `public_notes`.
 * Hors ligne, les appels lèvent une exception réseau.
 */
class PublicShareClient internal constructor(
    private val call: suspend (method: String, path: String, body: JsonObject?) -> JsonObject,
    private val baseUrlProvider: suspend () -> String?,
) {
    /** Vérifie si `public_notes` est actif sur le serveur (toujours vrai hors mode hébergé). */
    suspend fun isPublicNotesEnabled(): Boolean {
        val flags = call("GET", "/api/v1/feature-flags", null)
        val hosted = (flags["featureFlags"] as? JsonObject)
            ?.get("hosted")
            ?.let { (it as? JsonPrimitive)?.booleanOrNull } == true
        val billing = if (hosted) call("GET", "/api/v1/billing", null) else null
        return parsePublicNotesEnabled(flags, billing)
    }

    suspend fun get(noteUid: String): PublicShareState =
        parsePublicShare(call("GET", "/api/v1/note/$noteUid/public-share", null))

    suspend fun enable(noteUid: String): PublicShareState =
        parsePublicShare(call("POST", "/api/v1/note/$noteUid/public-share", null))

    suspend fun rotate(noteUid: String): PublicShareState =
        parsePublicShare(call("POST", "/api/v1/note/$noteUid/public-share/rotate", null))

    suspend fun disable(noteUid: String): PublicShareState =
        parsePublicShare(call("DELETE", "/api/v1/note/$noteUid/public-share", null))

    suspend fun publicUrl(token: String): String? =
        baseUrlProvider()?.let { "${it.trimEnd('/')}/public/notes/$token" }

    companion object {
        fun parsePublicShare(json: JsonObject): PublicShareState {
            val enabled = (json["enabled"] as? JsonPrimitive)?.booleanOrNull == true
            val token = (json["token"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val sharedAt = (json["shared_at"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val inheritStyle = (json["public_inherit_style"] as? JsonPrimitive)?.booleanOrNull ?: true
            return PublicShareState(
                enabled = enabled,
                token = token,
                sharedAt = sharedAt,
                inheritStyle = inheritStyle,
            )
        }

        fun parsePublicNotesEnabled(flagsJson: JsonObject, billingJson: JsonObject?): Boolean {
            val hosted = (flagsJson["featureFlags"] as? JsonObject)
                ?.get("hosted")
                ?.let { (it as? JsonPrimitive)?.booleanOrNull } == true
            if (!hosted) return true
            if (billingJson == null) return true
            val reason = (billingJson["reason"] as? JsonPrimitive)?.contentOrNull
            if (reason != "trial") return true
            val flag = (billingJson["features"] as? JsonObject)
                ?.get("public_notes")
                ?.let { (it as? JsonPrimitive)?.booleanOrNull }
            return flag != false
        }
    }
}
