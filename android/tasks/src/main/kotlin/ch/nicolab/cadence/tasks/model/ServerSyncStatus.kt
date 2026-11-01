package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** Un appareil qui a déjà synchronisé (clé API utilisée, non révoquée) et sa dernière synchro. */
data class SyncDevice(val name: String, val lastUsedAt: Instant?)

/**
 * Conflit gardé par le serveur (`sync_conflicts`), perdu par n'importe quel appareil : la valeur écartée et la
 * valeur gardée. [canKeepLost] faux pour une habitude : seul « Compris » s'offre.
 */
data class ServerConflict(
    val id: String,
    val key: String,
    val entityLabel: String,
    val name: String?,
    val fieldLabel: String,
    val lostText: String,
    val currentText: String,
    val canKeepLost: Boolean,
)

data class ServerSyncStatus(val devices: List<SyncDevice>, val lastChangeAt: Instant?, val conflicts: List<ServerConflict>) {
    companion object {
        /** Réponse de `GET /api/v1/sync/status` (même lecture que la page Synchronisation du web). */
        fun parse(json: JsonObject, zone: ZoneId = ZoneId.systemDefault()): ServerSyncStatus {
            val devices = (json["devices"] as? JsonArray).orEmpty().mapNotNull { element ->
                val device = element as? JsonObject ?: return@mapNotNull null
                val name = device.text("name") ?: return@mapNotNull null
                SyncDevice(name, device.instant("last_used_at"))
            }
            val conflicts = (json["conflicts"] as? JsonArray).orEmpty().mapNotNull { element ->
                val conflict = element as? JsonObject ?: return@mapNotNull null
                val id = conflict.text("id") ?: return@mapNotNull null
                val entity = conflict.text("entity") ?: return@mapNotNull null
                val uid = conflict.text("uid") ?: return@mapNotNull null
                val field = conflict.text("field") ?: return@mapNotNull null
                ServerConflict(
                    id = id,
                    key = SyncConflictMerge.key(entity, uid, field),
                    entityLabel = SyncConflictText.entityLabel(entity),
                    name = conflict.text("name"),
                    fieldLabel = SyncConflictText.fieldLabel(field),
                    lostText = side(conflict["lost"], field, zone),
                    currentText = side(conflict["current"], field, zone),
                    canKeepLost = (conflict["can_keep_lost"] as? JsonPrimitive)?.booleanOrNull == true,
                )
            }
            return ServerSyncStatus(devices, json.instant("last_change_at"), conflicts)
        }

        /** Le nom lu par le serveur pour une référence, sinon la valeur rendue comme sur le téléphone. */
        private fun side(element: JsonElement?, field: String, zone: ZoneId): String {
            val side = element as? JsonObject
            return side?.text("label") ?: SyncConflictText.render(field, side?.get("value"), zone)
        }

        private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

        private fun JsonObject.instant(key: String): Instant? = text(key)?.let { runCatching { Instant.parse(it) }.getOrNull() }
    }
}

/** Une ligne de la liste des conflits : perdu par le téléphone seul, ou gardé par le serveur. */
sealed interface ConflictRow {
    data class Local(val item: SyncConflictItem) : ConflictRow

    /** [localId] : la même perte enregistrée par le téléphone, effacée quand le conflit est réglé. */
    data class Server(val conflict: ServerConflict, val localId: String?) : ConflictRow
}

object SyncConflictMerge {
    fun key(entity: String, uid: String, field: String): String = "$entity|$uid|$field"

    /**
     * Conflits du serveur d'abord (ils couvrent tous les appareils et se règlent pour tous), puis ceux que seul le
     * téléphone connaît (hors ligne, ou pas encore lus). Un même champ (`entité|uid|champ`) ne donne qu'une ligne :
     * celle du serveur, qui garde l'id local pour l'effacer aussi.
     */
    fun merge(local: List<SyncConflictItem>, server: List<ServerConflict>): List<ConflictRow> {
        val localByKey = local.associateBy { it.key }
        val serverKeys = server.mapTo(HashSet()) { it.key }
        return server.map { ConflictRow.Server(it, localByKey[it.key]?.id) } +
            local.filterNot { it.key in serverKeys }.map { ConflictRow.Local(it) }
    }
}
