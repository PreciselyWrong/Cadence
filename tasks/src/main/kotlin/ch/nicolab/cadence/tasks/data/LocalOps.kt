package ch.nicolab.cadence.tasks.data

import java.util.UUID
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Fabrique les opérations d'envoi des écritures locales, au format de `/sync/push`. */
internal object LocalOps {
    /** [fields] sont les valeurs ; chacune reçoit l'horloge de l'écriture. */
    fun upsert(entity: String, uid: String, fields: Map<String, JsonElement>, clock: String, nowMs: Long) =
        build(entity, uid, "upsert", nowMs) {
            put("fields", JsonObject(fields.mapValues { (_, value) ->
                buildJsonObject {
                    put("value", value)
                    put("hlc", clock)
                }
            }))
        }

    fun delete(entity: String, uid: String, clock: String, nowMs: Long) =
        build(entity, uid, "delete", nowMs) { put("hlc", clock) }

    /** Occurrence désignée par sa date d'échéance exacte, pour que deux appareils ne l'avancent pas deux fois. */
    fun occurrence(action: String, uid: String, occurrenceDate: String, clock: String, nowMs: Long) =
        build("task", uid, action, nowMs) {
            put("occurrence_date", occurrenceDate)
            put("hlc", clock)
        }

    private inline fun build(
        entity: String,
        uid: String,
        action: String,
        nowMs: Long,
        body: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit,
    ): OutboxEntity {
        val opId = UUID.randomUUID().toString()
        val payload = buildJsonObject {
            put("op_id", opId)
            put("entity", entity)
            put("uid", uid)
            put("action", action)
            body()
        }
        return OutboxEntity(
            opId = opId,
            entity = entity,
            uid = uid,
            action = action,
            payloadJson = payload.toString(),
            createdAtMs = nowMs,
        )
    }
}
