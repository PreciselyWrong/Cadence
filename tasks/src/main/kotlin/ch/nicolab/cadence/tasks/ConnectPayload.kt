package ch.nicolab.cadence.tasks

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Contenu du code QR affiché par Tududi sous une clé API neuve. */
data class ConnectPayload(val serverUrl: String, val token: String) {
    companion object {
        /** `{"tududi":1,"server":"https://…","token":"tt_…"}` ; null si ce n'en est pas un. */
        fun parse(text: String): ConnectPayload? = runCatching {
            val json = Json.parseToJsonElement(text.trim()) as JsonObject
            if (json["tududi"]?.jsonPrimitive?.intOrNull != 1) return null
            val server = json["server"]!!.jsonPrimitive.content.trimEnd('/')
            val token = json["token"]!!.jsonPrimitive.content
            if (server.isBlank() || token.isBlank()) null else ConnectPayload(server, token)
        }.getOrNull()
    }
}
