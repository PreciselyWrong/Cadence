package ch.nicolab.cadence.tasks.triage

import ch.nicolab.cadence.tasks.brief.BriefStore
import ch.nicolab.cadence.tasks.brief.QuestionDto
import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class TriageTaskDto(
    val uid: String = "",
    val name: String = "",
    val note: String? = null,
    val status: String? = null,
    @SerialName("due_date") val dueDate: String? = null,
    @SerialName("project_name") val projectName: String? = null,
    val tags: List<String> = emptyList(),
    val recurring: Boolean = false,
)

@Serializable
data class TriageItemDto(
    val key: String = "",
    val type: String = "",
    val source: String = "rules",
    @SerialName("task_uid") val taskUid: String? = null,
    val action: String = "",
    val payload: JsonObject? = null,
    val reason: String = "",
    val details: List<String> = emptyList(),
    val question: QuestionDto? = null,
)

@Serializable
data class TriageQueueDto(
    val items: List<TriageItemDto> = emptyList(),
    val tasks: Map<String, TriageTaskDto> = emptyMap(),
    val count: Int = 0,
)

/** Les actions proposées et celles que « Corriger » permet de choisir à la place. */
internal object TriageActions {
    const val RENAME = "rename"
    const val SPLIT = "split"
    const val SET_DUE = "set_due"
    const val DONE = "done"
    const val CANCEL = "cancel"
    const val DELETE = "delete"
    const val RECLASS = "reclass"
    const val TO_NOTE = "to_note"
    const val TO_PROJECT = "to_project"
    const val TO_HABIT = "to_habit"

    /** Une tâche récurrente reste une série : on ne la convertit ni ne la supprime d'ici. */
    fun choices(task: TriageTaskDto): List<String> = buildList {
        add(RENAME)
        add(SET_DUE)
        add(DONE)
        add(CANCEL)
        if (!task.recurring) {
            add(SPLIT)
            add(TO_NOTE)
            add(TO_PROJECT)
            add(TO_HABIT)
            add(DELETE)
        }
    }

    /** Sous-tâches d'un texte libre, une par ligne. */
    fun subtasks(text: String): List<String> = text.lines().map { it.trim() }.filter { it.isNotEmpty() }

    /** Valeur proposée d'un champ de la proposition (`name`, `due_date`), vide sinon. */
    fun field(payload: JsonObject?, name: String): String =
        (payload?.get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()
}

internal object TriageRequests {
    fun keep(taskUid: String, key: String, label: String) = DeferredCall(
        key = "triage-keep:$key",
        method = "POST",
        path = "/api/v1/triage/keep",
        body = buildJsonObject { put("task_uid", taskUid) },
        label = label,
    )

    fun apply(taskUid: String, action: String, payload: JsonElement?, key: String, label: String) = DeferredCall(
        key = "triage-apply:$key",
        method = "POST",
        path = "/api/v1/triage/apply",
        body = buildJsonObject {
            put("task_uid", taskUid)
            put("action", action)
            if (payload != null) put("payload", payload)
            put("idempotency_key", key)
        },
        label = label,
    )
}

/** File « À trier » : lue en ligne, gardée pour le hors ligne ; les décisions partent par la file d'appels différés. */
class TriageRepository internal constructor(
    private val store: BriefStore,
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val defer: suspend (DeferredCall) -> Unit,
) {
    private val _queue = MutableStateFlow(store.readTriage()?.let(::decode))
    val queue: StateFlow<TriageQueueDto?> = _queue.asStateFlow()

    suspend fun refresh(): Result<Unit> = try {
        val body = call("GET", "/api/v1/triage", emptyMap(), null)
        store.writeTriage(body.toString())
        _queue.value = decode(body.toString())
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    internal suspend fun send(call: DeferredCall) = defer(call)

    private fun decode(raw: String): TriageQueueDto? = runCatching { JSON.decodeFromString<TriageQueueDto>(raw) }.getOrNull()

    private companion object {
        val JSON = Json { ignoreUnknownKeys = true }
    }
}
