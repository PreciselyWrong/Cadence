package ch.nicolab.cadence.tasks.sync

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Ce que le serveur sait synchroniser, lu dans `/sync/meta` : ses entités et, pour chacune, les champs qu'un
 * envoi peut nommer (`fields`, clés de `refs` et de `lists`). Un serveur plus ancien ne connaît pas une entité
 * ajoutée depuis (`link` avant le schéma 3 des liens) ; un plus récent en a d'autres, que l'appareil ignore.
 * Sans liste d'entités, tout est supposé connu, comme avant la lecture de `meta`.
 */
class ServerCatalog private constructor(
    val schemaVersion: Int?,
    /** Null : le serveur ne décrit pas ses entités. Valeur nulle : entité connue, champs non décrits. */
    private val entities: Map<String, Set<String>?>?,
) {
    fun knows(entity: String): Boolean = entities == null || entity in entities

    /** L'opération peut partir : entité connue et aucun champ que le serveur refuserait (`unknown_field`). */
    fun accepts(op: OutboxOp): Boolean {
        if (!knows(op.entity)) return false
        val known = entities?.get(op.entity) ?: return true
        val fields = op.payload["fields"] as? JsonObject ?: return true
        return known.containsAll(fields.keys)
    }

    companion object {
        val UNKNOWN = ServerCatalog(null, null)

        fun of(meta: JsonObject): ServerCatalog {
            val schema = (meta["schema_version"] as? JsonPrimitive)?.intOrNull
            val list = meta["entities"] as? JsonArray ?: return ServerCatalog(schema, null)
            val entities = list.mapNotNull { element ->
                val entity = element as? JsonObject ?: return@mapNotNull null
                val name = (entity["name"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
                name to fieldsOf(entity)
            }.toMap()
            return ServerCatalog(schema, entities)
        }

        private fun fieldsOf(entity: JsonObject): Set<String>? {
            val fields = entity["fields"] as? JsonArray ?: return null
            return buildSet {
                fields.forEach { field -> (field as? JsonPrimitive)?.contentOrNull?.let(::add) }
                (entity["refs"] as? JsonObject)?.keys?.let(::addAll)
                (entity["lists"] as? JsonObject)?.keys?.let(::addAll)
            }
        }
    }
}
