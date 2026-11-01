package ch.nicolab.cadence.tasks.syncstatus

import ch.nicolab.cadence.tasks.model.ServerSyncStatus
import java.net.URLEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * État de la synchro vu du serveur (`/api/v1/sync/status`, docs/30-offline-sync.md) : appareils et conflits perdus
 * par n'importe quel appareil. Lu en ligne seulement ; hors ligne, Réglages montre la liste du téléphone.
 */
class SyncStatusClient internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
) {
    suspend fun status(): Result<ServerSyncStatus> = runCatching {
        ServerSyncStatus.parse(call("GET", "/api/v1/sync/status", emptyMap(), null))
    }

    /** [keepLost] : la valeur écartée devient une nouvelle écriture ; sinon la ligne reste telle quelle. */
    suspend fun resolve(id: String, keepLost: Boolean): Result<Unit> = runCatching {
        val body = JsonObject(mapOf("keep" to JsonPrimitive(if (keepLost) "lost" else "current")))
        call("POST", "/api/v1/sync/conflicts/${URLEncoder.encode(id, "UTF-8")}/resolve", emptyMap(), body)
        Unit
    }
}
