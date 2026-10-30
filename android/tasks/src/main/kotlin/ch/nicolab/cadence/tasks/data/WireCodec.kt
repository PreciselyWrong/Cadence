package ch.nicolab.cadence.tasks.data

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.IOException

/**
 * Traduction entre les lignes Room et le format serveur (noms snake_case, références
 * par uid). Une seule correspondance pour les lectures serveur, les écritures locales
 * et le réapplication des modifications en attente.
 */
internal object WireCodec {
    private val taskKeys = setOf(
        "uid", "name", "note", "status", "priority", "due_date", "due_has_time", "defer_until",
        "reminder_at", "recurrence_type", "project_uid", "area_uid", "parent_task_uid", "tag_uids",
        "completed_at", "pinned_at", "field_clocks",
    )

    private val json = Json { ignoreUnknownKeys = true }

    fun taskFromWire(wire: JsonObject): TaskEntity = TaskEntity(
        uid = wire.requireString("uid"),
        name = wire.string("name").orEmpty(),
        note = wire.string("note"),
        status = wire.int("status") ?: 0,
        priority = wire.int("priority"),
        dueDateRaw = wire.string("due_date"),
        dueHasTime = wire.bool("due_has_time"),
        deferUntilRaw = wire.string("defer_until"),
        reminderAtRaw = wire.string("reminder_at"),
        recurrenceType = wire.string("recurrence_type"),
        projectUid = wire.string("project_uid"),
        areaUid = wire.string("area_uid"),
        parentTaskUid = wire.string("parent_task_uid"),
        tagUidsJson = (wire["tag_uids"] as? JsonArray ?: JsonArray(emptyList())).toString(),
        completedAtRaw = wire.string("completed_at"),
        pinnedAtRaw = wire.string("pinned_at"),
        fieldClocksJson = (wire["field_clocks"] as? JsonObject ?: JsonObject(emptyMap())).toString(),
        extrasJson = JsonObject(wire.filterKeys { it !in taskKeys }).toString(),
    )

    fun taskToWire(task: TaskEntity): JsonObject {
        val known = buildJsonObject {
            put("uid", task.uid)
            put("name", task.name)
            put("note", task.note)
            put("status", task.status)
            put("priority", task.priority)
            put("due_date", task.dueDateRaw)
            put("due_has_time", task.dueHasTime)
            put("defer_until", task.deferUntilRaw)
            put("reminder_at", task.reminderAtRaw)
            put("recurrence_type", task.recurrenceType)
            put("project_uid", task.projectUid)
            put("area_uid", task.areaUid)
            put("parent_task_uid", task.parentTaskUid)
            put("tag_uids", json.parseToJsonElement(task.tagUidsJson))
            put("completed_at", task.completedAtRaw)
            put("pinned_at", task.pinnedAtRaw)
            put("field_clocks", json.parseToJsonElement(task.fieldClocksJson))
        }
        val extras = json.parseToJsonElement(task.extrasJson).jsonObject
        return JsonObject(extras + known)
    }

    fun projectFromWire(wire: JsonObject) = ProjectEntity(
        uid = wire.requireString("uid"),
        name = wire.string("name").orEmpty(),
        status = wire.string("status"),
        color = wire.string("color"),
        areaUid = wire.string("area_uid"),
        pinToSidebar = wire.bool("pin_to_sidebar"),
    )

    fun areaFromWire(wire: JsonObject) = AreaEntity(
        uid = wire.requireString("uid"),
        name = wire.string("name").orEmpty(),
        color = wire.string("color"),
    )

    fun tagFromWire(wire: JsonObject) = TagEntity(
        uid = wire.requireString("uid"),
        name = wire.string("name").orEmpty(),
        color = wire.string("color"),
    )

    fun noteFromWire(wire: JsonObject) = NoteEntity(
        uid = wire.requireString("uid"),
        title = wire.string("title").orEmpty(),
        content = wire.string("content").orEmpty(),
        color = wire.string("color"),
        projectUid = wire.string("project_uid"),
        tagUidsJson = (wire["tag_uids"] as? JsonArray ?: JsonArray(emptyList())).toString(),
        updatedAtRaw = wire.string("updated_at"),
        pinned = wire.bool("pin_to_sidebar"),
    )

    /** Ligne locale au format serveur : base des écritures partielles d'une note. */
    fun noteToWire(note: NoteEntity): JsonObject = buildJsonObject {
        put("uid", note.uid)
        put("title", note.title)
        put("content", note.content)
        put("color", note.color)
        put("project_uid", note.projectUid)
        put("tag_uids", json.parseToJsonElement(note.tagUidsJson))
        put("updated_at", note.updatedAtRaw)
        put("pin_to_sidebar", note.pinned)
    }

    fun inboxFromWire(wire: JsonObject) = InboxItemEntity(
        uid = wire.requireString("uid"),
        content = wire.string("content").orEmpty(),
        status = wire.string("status").orEmpty(),
        createdAtRaw = wire.string("created_at"),
    )

    fun decodeTagUids(tagUidsJson: String): List<String> =
        json.decodeFromString(ListSerializer(String.serializer()), tagUidsJson)

    private fun JsonObject.requireString(key: String): String =
        string(key) ?: throw IOException("Réponse invalide : $key manquant")

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull

    private fun JsonObject.bool(key: String): Boolean = (this[key] as? JsonPrimitive)?.booleanOrNull == true
}
