package ch.nicolab.cadence.data.sync

import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** Conversions entre les valeurs de colonne Room et le JSON du fil. */
object WireValues {
    /** Les instants du fil sont du ISO 8601 avec `Z` ou un décalage. */
    fun parseInstantMs(text: String): Long? = runCatching { Instant.parse(text).toEpochMilli() }
        .recoverCatching { OffsetDateTime.parse(text).toInstant().toEpochMilli() }
        .getOrNull()

    fun formatInstantMs(ms: Long): String = Instant.ofEpochMilli(ms).toString()
}

/** Une valeur du serveur qui ne se lit pas dans le genre attendu : la ligne est ignorée, jamais devinée. */
class MalformedRow(message: String) : Exception(message)

object HabitWire {
    /** Valeur d'une colonne sous sa forme sur le fil. */
    fun toWire(kind: ColumnKind, value: Any?): JsonElement = when {
        value == null -> JsonNull
        kind == ColumnKind.TEXT -> JsonPrimitive(value as String)
        kind == ColumnKind.NUMBER -> JsonPrimitive((value as Number).toLong())
        kind == ColumnKind.BOOLEAN -> JsonPrimitive((value as Number).toLong() != 0L)
        else -> JsonPrimitive(WireValues.formatInstantMs((value as Number).toLong()))
    }

    /** Les champs [only] d'une ligne locale (tous si null), nommés comme sur le fil. */
    fun rowToWire(spec: EntitySpec, row: Map<String, Any?>, only: Set<String>? = null): Map<String, JsonElement> =
        spec.fields
            .filter { only == null || it.wire in only }
            .associate { it.wire to toWire(it.kind, row[it.column]) }

    /**
     * Les colonnes qu'une ligne serveur impose. Un champ absent du JSON n'est pas touché ; un champ
     * présent mais null prend la valeur de repli du champ s'il en a une.
     */
    fun wireToColumns(spec: EntitySpec, data: JsonObject): Map<String, Any?> {
        val out = linkedMapOf<String, Any?>()
        for (field in spec.fields) {
            val element = data[field.wire] ?: continue
            out[field.column] = if (element is JsonNull) field.whenNull?.invoke(data) else fromWire(field, element)
        }
        return out
    }

    private fun fromWire(field: FieldSpec, element: JsonElement): Any {
        val primitive = element as? JsonPrimitive ?: throw MalformedRow("${field.wire}: valeur composite")
        return when (field.kind) {
            ColumnKind.TEXT -> primitive.contentOrNull ?: throw MalformedRow("${field.wire}: texte attendu")
            ColumnKind.NUMBER -> primitive.longOrNull ?: throw MalformedRow("${field.wire}: entier attendu")
            ColumnKind.BOOLEAN -> if (primitive.booleanOrNull ?: throw MalformedRow("${field.wire}: booléen attendu")) 1L else 0L
            ColumnKind.INSTANT -> primitive.contentOrNull?.let(WireValues::parseInstantMs)
                ?: throw MalformedRow("${field.wire}: instant attendu")
        }
    }

    fun uidOf(data: JsonObject): String =
        data["uid"]?.jsonPrimitive?.contentOrNull ?: throw MalformedRow("uid absent")

    /** Horloge hybride d'un champ écrit à [changedMs] : même format que `Hlc` côté tâches. */
    fun hlc(changedMs: Long, node: String): String = "${changedMs.toString().padStart(13, '0')}-0000-$node"

    /** Instant (ms) d'une horloge hybride, ou null si elle est mal formée. */
    fun hlcMs(clock: String): Long? = clock.takeIf { it.length > 13 && it[13] == '-' }?.take(13)?.toLongOrNull()

    /** Identifiant stable d'une opération : renvoyer la même ligne inchangée redonne le même `op_id`. */
    fun opId(entries: List<OutboxEntry>): String {
        val seed = entries.sortedBy { it.field }.joinToString("|") { "${it.entity}/${it.uid}/${it.field}/${it.changedMs}" }
        return "hab-" + UUID.nameUUIDFromBytes(seed.toByteArray(Charsets.UTF_8))
    }
}
