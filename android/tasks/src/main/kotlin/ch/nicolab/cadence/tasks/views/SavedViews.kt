package ch.nicolab.cadence.tasks.views

import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** Vue enregistrée sur le serveur (`GET /api/v1/views`, `/api/v1/views/pinned`). */
data class SavedView(
    val uid: String,
    val name: String,
    val searchQuery: String? = null,
    val filters: List<String> = emptyList(),
    val priority: String? = null,
    val due: String? = null,
    val defer: String? = null,
    val tags: List<String> = emptyList(),
    val extras: List<String> = emptyList(),
    val recurring: String? = null,
    val taskStatus: String? = null,
    val projectUid: String? = null,
    val isPinned: Boolean = false,
)

/** Résultat de l'évaluation locale d'une vue sur les tâches Room. */
sealed class ViewEvaluation {
    data class Local(val tasks: List<TaskItem>) : ViewEvaluation()
    data object NeedsOnlineOrWeb : ViewEvaluation()
}

/** Résultat d'une lecture en ligne des tâches d'une vue (`/api/v1/search`). */
sealed class OnlineViewResult {
    data class TaskUids(val uids: List<String>) : OnlineViewResult()
    data object WebOnly : OnlineViewResult()
}

/** Évaluateur pur des filtres d'une [SavedView] sur les tâches locales (`docs/08-views-system.md`). */
object SavedViewFilter {
    private val SUPPORTED_FILTERS = setOf("task", "tasks")
    private val PRIORITY_MAP = mapOf(
        "low" to TaskPriority.LOW,
        "medium" to TaskPriority.MEDIUM,
        "high" to TaskPriority.HIGH,
    )
    private val STATUS_MAP = mapOf(
        "not_started" to TaskStatus.NOT_STARTED,
        "in_progress" to TaskStatus.IN_PROGRESS,
        "done" to TaskStatus.DONE,
        "archived" to TaskStatus.ARCHIVED,
        "waiting" to TaskStatus.WAITING,
        "cancelled" to TaskStatus.CANCELLED,
        "planned" to TaskStatus.PLANNED,
    )
    private val SUPPORTED_DUE = setOf(
        "today",
        "tomorrow",
        "this_week",
        "next_week",
        "next_month",
        "overdue",
        "no_due_date",
    )
    private val SUPPORTED_DEFER = setOf("deferred", "not_deferred")
    private val SUPPORTED_EXTRAS = setOf(
        "recurring",
        "not_recurring",
        "overdue",
        "has_content",
        "no_content",
        "deferred",
        "not_deferred",
        "has_tags",
        "no_tags",
        "no_due_date",
        "assigned_to_project",
        "no_project",
    )

    fun canEvaluateLocally(view: SavedView): Boolean {
        if (view.filters.any { it.trim().lowercase() !in SUPPORTED_FILTERS }) return false
        if (!view.recurring.isNullOrBlank()) return false
        if (!view.priority.isNullOrBlank() && view.priority.lowercase() !in PRIORITY_MAP) return false
        if (!view.taskStatus.isNullOrBlank() && view.taskStatus.lowercase() !in STATUS_MAP) return false
        if (!view.due.isNullOrBlank() && view.due.lowercase() !in SUPPORTED_DUE) return false
        if (!view.defer.isNullOrBlank() && view.defer.lowercase() !in SUPPORTED_DEFER) return false
        if (view.extras.any { it.trim().lowercase() !in SUPPORTED_EXTRAS }) return false
        return true
    }

    fun evaluate(
        view: SavedView,
        tasks: List<TaskItem>,
        tags: List<TagItem>,
        today: LocalDate,
        now: Instant,
    ): ViewEvaluation {
        if (!canEvaluateLocally(view)) return ViewEvaluation.NeedsOnlineOrWeb

        val requiredStatus = view.taskStatus?.takeIf { it.isNotBlank() }?.lowercase()?.let(STATUS_MAP::get)
        val requiredPriority = view.priority?.takeIf { it.isNotBlank() }?.lowercase()?.let(PRIORITY_MAP::get)
        val dueFilter = view.due?.takeIf { it.isNotBlank() }?.lowercase()
        val deferFilter = view.defer?.takeIf { it.isNotBlank() }?.lowercase()
        val extras = view.extras.map { it.trim().lowercase() }.toSet()
        val query = view.searchQuery?.trim()?.takeIf { it.isNotEmpty() }?.let(::fold)

        val tagUidsByName = tags.associate { it.name.trim().lowercase() to it.uid }
        val requiredTagUids = view.tags.mapNotNull { tagName ->
            val key = tagName.trim().lowercase()
            if (key.isEmpty()) null else tagUidsByName[key] ?: return ViewEvaluation.Local(emptyList())
        }

        val matching = tasks.filter { task ->
            if (task.virtual || task.parentTaskUid != null) return@filter false
            if (requiredStatus != null) {
                if (task.status != requiredStatus) return@filter false
            } else {
                if (task.isClosed) return@filter false
            }
            if (!view.projectUid.isNullOrBlank() && task.projectUid != view.projectUid) return@filter false
            if (requiredPriority != null && task.priority != requiredPriority) return@filter false
            if (dueFilter != null && !matchesDue(dueFilter, task, today)) return@filter false
            if (deferFilter != null && !matchesDefer(deferFilter, task, now)) return@filter false
            if (requiredTagUids.isNotEmpty() && !requiredTagUids.all { it in task.tagUids }) return@filter false
            if (query != null && !matchesQuery(query, task)) return@filter false
            if (extras.any { !matchesExtra(it, task, today, now) }) return@filter false
            true
        }
        return ViewEvaluation.Local(matching)
    }

    private fun matchesDue(due: String, task: TaskItem, today: LocalDate): Boolean {
        val d = task.dueDay
        return when (due) {
            "today" -> d == today
            "tomorrow" -> d == today.plusDays(1)
            "this_week", "next_week" -> d != null && !d.isBefore(today) && !d.isAfter(today.plusDays(7))
            "next_month" -> d != null && !d.isBefore(today) && !d.isAfter(today.plusMonths(1))
            "overdue" -> d != null && d.isBefore(today) && !task.isClosed
            "no_due_date" -> d == null
            else -> false
        }
    }

    private fun matchesDefer(defer: String, task: TaskItem, now: Instant): Boolean = when (defer) {
        "deferred" -> task.deferUntil != null && task.deferUntil.isAfter(now)
        "not_deferred" -> task.deferUntil == null || !task.deferUntil.isAfter(now)
        else -> false
    }

    private fun matchesExtra(extra: String, task: TaskItem, today: LocalDate, now: Instant): Boolean = when (extra) {
        "recurring" -> task.isRecurring
        "not_recurring" -> !task.isRecurring
        "overdue" -> task.dueDay != null && task.dueDay.isBefore(today)
        "has_content" -> !task.note.isNullOrBlank()
        "no_content" -> task.note.isNullOrBlank()
        "deferred" -> task.deferUntil != null && task.deferUntil.isAfter(now)
        "not_deferred" -> task.deferUntil == null || !task.deferUntil.isAfter(now)
        "has_tags" -> task.tagUids.isNotEmpty()
        "no_tags" -> task.tagUids.isEmpty()
        "no_due_date" -> task.dueDay == null
        "assigned_to_project" -> task.projectUid != null
        "no_project" -> task.projectUid == null
        else -> false
    }

    private fun matchesQuery(foldedQuery: String, task: TaskItem): Boolean =
        fold(task.name).contains(foldedQuery) || fold(task.note.orEmpty()).contains(foldedQuery)

    private fun fold(text: String): String =
        Normalizer.normalize(text.lowercase(), Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
}

/** Client en ligne pour les vues enregistrées (`GET /api/v1/views`, `PATCH /api/v1/views/:uid`, `/api/v1/search`). */
class ViewsClient internal constructor(
    private val callJson: suspend (method: String, path: String, query: Map<String, String>) -> JsonElement,
    private val callObj: suspend (method: String, path: String, body: JsonObject?) -> JsonObject,
) {
    suspend fun listAll(): List<SavedView> =
        parseViews(callJson("GET", "/api/v1/views", emptyMap()))

    suspend fun setPinned(uid: String, pinned: Boolean): SavedView? {
        val body = JsonObject(mapOf("is_pinned" to JsonPrimitive(pinned)))
        return parseView(callObj("PATCH", "/api/v1/views/$uid", body))
    }

    suspend fun fetchTaskUidsOnline(view: SavedView): OnlineViewResult {
        val nonTask = view.filters.any { it.trim().lowercase() !in setOf("task", "tasks") }
        if (nonTask) return OnlineViewResult.WebOnly

        val query = buildMap {
            put("filters", "Task")
            put("excludeSubtasks", "true")
            put("limit", "100")
            view.searchQuery?.takeIf { it.isNotBlank() }?.let { put("q", it) }
            view.priority?.takeIf { it.isNotBlank() }?.let { put("priority", it) }
            view.due?.takeIf { it.isNotBlank() }?.let { put("due", it) }
            view.defer?.takeIf { it.isNotBlank() }?.let { put("defer", it) }
            if (view.tags.isNotEmpty()) put("tags", view.tags.joinToString(","))
            if (view.extras.isNotEmpty()) put("extras", view.extras.joinToString(","))
            view.recurring?.takeIf { it.isNotBlank() }?.let { put("recurring", it) }
            view.projectUid?.takeIf { it.isNotBlank() }?.let { put("project_uid", it) }
            val ts = view.taskStatus?.takeIf { it.isNotBlank() }
            if (ts != null) {
                put("task_status", ts)
            } else {
                put("status", "active")
            }
        }
        val response = callJson("GET", "/api/v1/search", query) as? JsonObject
            ?: return OnlineViewResult.WebOnly
        val uids = (response["results"] as? JsonArray).orEmpty().mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val type = (obj["type"] as? JsonPrimitive)?.contentOrNull
            if (type != null && type != "Task") return@mapNotNull null
            (obj["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
        }
        return OnlineViewResult.TaskUids(uids)
    }

    companion object {
        fun parseViews(element: JsonElement): List<SavedView> =
            (element as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::parseView) }

        fun parseView(obj: JsonObject): SavedView? {
            val uid = (obj["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val name = (obj["name"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            fun str(key: String) = (obj[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            fun strList(key: String) = (obj[key] as? JsonArray).orEmpty()
                .mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.takeIf { s -> s.isNotBlank() } }
            return SavedView(
                uid = uid,
                name = name,
                searchQuery = str("search_query"),
                filters = strList("filters"),
                priority = str("priority"),
                due = str("due"),
                defer = str("defer"),
                tags = strList("tags"),
                extras = strList("extras"),
                recurring = str("recurring"),
                taskStatus = str("task_status"),
                projectUid = str("project_uid"),
                isPinned = (obj["is_pinned"] as? JsonPrimitive)?.booleanOrNull == true,
            )
        }
    }
}
