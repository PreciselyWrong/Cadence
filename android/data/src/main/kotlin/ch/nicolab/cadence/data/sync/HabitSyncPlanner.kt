package ch.nicolab.cadence.data.sync

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Un champ en attente d'envoi : [uid] et [field] (nom sur le fil, ou `*delete`) écrits à [changedMs]. */
data class OutboxEntry(val entity: String, val uid: String, val field: String, val changedMs: Long)

/** Une opération prête à partir : les champs avec leur valeur actuelle, ou une suppression. */
class PlannedOp(
    val opId: String,
    val entity: String,
    val uid: String,
    val delete: Boolean,
    val fields: Map<String, PlannedField>,
    /** Les écritures que cette opération épuise une fois acquittée. */
    val entries: List<OutboxEntry>,
) {
    /** Au format de `POST /sync/push`. */
    fun toPayload(node: String): JsonObject = buildJsonObject {
        put("op_id", opId)
        put("entity", entity)
        put("uid", uid)
        if (delete) {
            put("action", "delete")
            put("hlc", HabitWire.hlc(entries.maxOf { it.changedMs }, node))
        } else {
            put("action", "upsert")
            put(
                "fields",
                JsonObject(
                    fields.mapValues { (_, field) ->
                        buildJsonObject {
                            put("value", field.value)
                            put("hlc", HabitWire.hlc(field.changedMs, node))
                        }
                    },
                ),
            )
        }
    }
}

class PlannedField(val value: JsonElement, val changedMs: Long)

/** Écritures sans ligne pour les porter (supprimées depuis) : à retirer de la file sans rien envoyer. */
class Plan(val ops: List<PlannedOp>, val orphans: List<OutboxEntry>)

/**
 * Transforme la file d'écritures en opérations de synchro. Pur : les lignes sont lues par [loadRow].
 *
 * - Un parent part avant ses enfants (ordre de [HabitSyncSpecs.order]).
 * - Une suppression emporte les écritures de champ de la même ligne.
 * - Les champs d'un groupe atomique partent ensemble, avec la même horloge (la plus récente du groupe).
 * - Un `op_id` dérive des écritures : la même ligne renvoyée sans changement garde le même identifiant.
 */
object HabitSyncPlanner {
    suspend fun plan(
        entries: List<OutboxEntry>,
        loadRow: suspend (entity: String, uid: String) -> Map<String, Any?>?,
    ): Plan {
        val rank = HabitSyncSpecs.order.withIndex().associate { (index, entity) -> entity to index }
        val groups = entries
            .filter { it.entity in rank }
            .groupBy { it.entity to it.uid }
            .entries
            .sortedWith(compareBy({ rank.getValue(it.key.first) }, { it.value.minOf { entry -> entry.changedMs } }))
        val ops = mutableListOf<PlannedOp>()
        val orphans = entries.filter { it.entity !in rank }.toMutableList()
        for ((key, group) in groups) {
            val (entity, uid) = key
            if (group.any { it.field == HabitSyncSpecs.DELETE_MARK }) {
                ops += PlannedOp(HabitWire.opId(group), entity, uid, true, emptyMap(), group)
                continue
            }
            val spec = HabitSyncSpecs.byEntity.getValue(entity)
            val row = loadRow(entity, uid)
            if (row == null) {
                orphans += group
                continue
            }
            val known = group.filter { it.field in spec.byWire }
            orphans += group - known.toSet()
            if (known.isEmpty()) continue
            ops += PlannedOp(HabitWire.opId(known), entity, uid, false, fieldsOf(spec, row, known), known)
        }
        return Plan(ops, orphans)
    }

    private fun fieldsOf(spec: EntitySpec, row: Map<String, Any?>, entries: List<OutboxEntry>): Map<String, PlannedField> {
        val changed = entries.associate { it.field to it.changedMs }
        val out = linkedMapOf<String, PlannedField>()
        for (wire in changed.keys) {
            val members = spec.withGroupmates(wire)
            val stamp = members.maxOf { changed[it.wire] ?: 0L }
            for (member in members) {
                out[member.wire] = PlannedField(HabitWire.toWire(member.kind, row[member.column]), stamp)
            }
        }
        return out
    }
}
