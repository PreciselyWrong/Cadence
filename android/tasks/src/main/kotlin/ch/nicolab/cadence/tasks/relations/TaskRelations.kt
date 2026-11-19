package ch.nicolab.cadence.tasks.relations

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

@Serializable
data class RelatedTaskRef(
    val uid: String,
    val name: String,
    val status: Int = TaskStatus.NOT_STARTED,
)

@Serializable
data class TaskRelationItem(
    val uid: String,
    val type: String,
    val task: RelatedTaskRef,
)

object TaskRelations {
    const val TYPE_BLOCKS = "blocks"
    const val TYPE_BLOCKED_BY = "blocked_by"
    private const val PENDING_PREFIX = "pending:"
    private const val ADD_KEY_PREFIX = "task-rel-add:"
    private const val DEL_KEY_PREFIX = "task-rel-del:"

    private val JSON = Json { ignoreUnknownKeys = true }

    fun parseList(body: JsonObject): List<TaskRelationItem> {
        val array = body["relations"] as? JsonArray ?: return emptyList()
        return array.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val uid = (obj["uid"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val type = (obj["type"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val taskObj = obj["task"] as? JsonObject ?: return@mapNotNull null
            val taskUid = (taskObj["uid"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val taskName = (taskObj["name"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val status = (taskObj["status"] as? JsonPrimitive)?.intOrNull ?: TaskStatus.NOT_STARTED
            TaskRelationItem(uid, type, RelatedTaskRef(taskUid, taskName, status))
        }
    }

    fun encodeCache(items: List<TaskRelationItem>): String = JSON.encodeToString(items)

    fun decodeCache(raw: String?): List<TaskRelationItem> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching { JSON.decodeFromString<List<TaskRelationItem>>(raw) }.getOrDefault(emptyList())
    }

    fun blocks(items: List<TaskRelationItem>): List<TaskRelationItem> =
        items.filter { it.type == TYPE_BLOCKS }

    fun blockedBy(items: List<TaskRelationItem>): List<TaskRelationItem> =
        items.filter { it.type == TYPE_BLOCKED_BY }

    /** Vrai lorsqu'au moins une tâche qui bloque celle-ci est encore ouverte. */
    fun hasOpenBlocker(items: List<TaskRelationItem>): Boolean =
        items.any { it.type == TYPE_BLOCKED_BY && !TaskStatus.isClosed(it.task.status) }

    fun isPending(relationUid: String): Boolean = relationUid.startsWith(PENDING_PREFIX)

    fun pendingUid(targetUid: String, type: String): String = "$PENDING_PREFIX$targetUid:$type"

    fun addCallKey(taskUid: String, targetUid: String, type: String): String =
        "$ADD_KEY_PREFIX$taskUid:$targetUid:$type"

    fun deleteCallKey(taskUid: String, relationUid: String): String =
        "$DEL_KEY_PREFIX$taskUid:$relationUid"

    fun createCall(taskUid: String, target: TaskItem, type: String): DeferredCall {
        val body = buildJsonObject {
            put("target_uid", target.uid)
            put("type", type)
        }
        return DeferredCall(
            key = addCallKey(taskUid, target.uid, type),
            method = "POST",
            path = "/api/v1/task/$taskUid/relations",
            body = body,
            label = "Lier : ${target.name}",
        )
    }

    fun deleteCall(taskUid: String, relationUid: String): DeferredCall = DeferredCall(
        key = deleteCallKey(taskUid, relationUid),
        method = "DELETE",
        path = "/api/v1/task/$taskUid/relations/$relationUid",
        body = null,
        label = "Retirer le lien",
    )

    /** Filtre les tâches proposables dans le sélecteur pour [taskUid] et [type]. */
    fun pickCandidates(
        allTasks: List<TaskItem>,
        taskUid: String,
        type: String,
        existing: List<TaskRelationItem>,
        query: String,
    ): List<TaskItem> {
        val linkedUids = existing.filter { it.type == type }.map { it.task.uid }.toSet()
        val needle = query.trim().lowercase()
        return allTasks.filter { task ->
            task.uid != taskUid &&
                !task.isClosed &&
                !task.virtual &&
                task.uid !in linkedUids &&
                (needle.isEmpty() || task.name.lowercase().contains(needle))
        }
    }
}
