package ch.nicolab.cadence.tasks.relations

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonObject

/**
 * Liens « Bloque / Bloquée par » d'une tâche : lus en ligne à l'ouverture de la fiche (avec cache local
 * par tâche pour la lecture hors ligne), écrits par la file d'appels différés.
 */
internal class TaskRelationsRepository(
    private val prefs: SharedPreferences,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val defer: suspend (DeferredCall) -> Result<Unit>,
    private val cancelDeferred: suspend (String) -> Unit,
) {
    private val cache = MutableStateFlow<Map<String, List<TaskRelationItem>>>(emptyMap())

    fun observe(taskUid: String): Flow<List<TaskRelationItem>> = cache.map { map ->
        map[taskUid] ?: loadCached(taskUid)
    }

    suspend fun refresh(taskUid: String) {
        if (cache.value[taskUid] == null) {
            updateCache(taskUid, loadCached(taskUid))
        }
        try {
            val body = call("GET", "/api/v1/task/$taskUid/relations", emptyMap(), null)
            val parsed = TaskRelations.parseList(body)
            saveCached(taskUid, parsed)
            updateCache(taskUid, parsed)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Hors ligne ou erreur passagère : on garde le cache local.
        }
    }

    suspend fun addRelation(taskUid: String, target: ch.nicolab.cadence.tasks.model.TaskItem, type: String) {
        val current = cache.value[taskUid] ?: loadCached(taskUid)
        val optimistic = TaskRelationItem(
            uid = TaskRelations.pendingUid(target.uid, type),
            type = type,
            task = RelatedTaskRef(target.uid, target.name, target.status),
        )
        val next = current.filterNot { it.type == type && it.task.uid == target.uid } + optimistic
        saveCached(taskUid, next)
        updateCache(taskUid, next)
        defer(TaskRelations.createCall(taskUid, target, type))
    }

    suspend fun removeRelation(taskUid: String, relation: TaskRelationItem) {
        val current = cache.value[taskUid] ?: loadCached(taskUid)
        val next = current.filterNot { it.uid == relation.uid }
        saveCached(taskUid, next)
        updateCache(taskUid, next)
        if (TaskRelations.isPending(relation.uid)) {
            cancelDeferred(TaskRelations.addCallKey(taskUid, relation.task.uid, relation.type))
        } else {
            defer(TaskRelations.deleteCall(taskUid, relation.uid))
        }
    }

    private fun loadCached(taskUid: String): List<TaskRelationItem> =
        TaskRelations.decodeCache(prefs.getString(taskUid, null))

    private fun saveCached(taskUid: String, items: List<TaskRelationItem>) {
        prefs.edit { putString(taskUid, TaskRelations.encodeCache(items)) }
    }

    private fun updateCache(taskUid: String, items: List<TaskRelationItem>) {
        cache.value = cache.value + (taskUid to items)
    }

    companion object {
        fun prefs(context: Context): SharedPreferences =
            context.getSharedPreferences("cadence_task_relations", Context.MODE_PRIVATE)
    }
}
