package ch.nicolab.cadence.tasks.review

import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Lecture des réponses de `backend/modules/review/` (docs/34-review.md). L'ordre et le contenu des
 * listes viennent du serveur : rien n'est reclassé ici.
 */
internal object ReviewJson {
    fun summary(body: JsonObject): ReviewSummary {
        val counts = body.obj("counts")
        return ReviewSummary(
            counts = ReviewCounts(
                pushed = counts.int("pushed"),
                undecided = counts.int("undecided"),
                later = counts.int("later"),
                reviewDue = counts.int("review_due"),
                projects = counts.int("projects"),
                stale = counts.int("stale"),
            ),
            attentionTotal = body.int("attention_total"),
            decidedThisWeek = body.int("decided_this_week"),
            weekStart = body.day("week_start"),
        )
    }

    /** `pushed` (`{task, push}`), `later` et `stale` (`{task, review_due, last_activity_at}`). */
    fun tasks(body: JsonObject): ReviewPage<ReviewTask> = ReviewPage(
        total = body.int("total"),
        items = body.array("items").mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val task = item["task"] as? JsonObject ?: return@mapNotNull null
            task(task)?.copy(
                reviewDue = item.bool("review_due"),
                push = (item["push"] as? JsonObject)?.let(::push),
                lastActivityAt = item.instant("last_activity_at"),
            )
        },
    )

    fun inbox(body: JsonObject): ReviewPage<ReviewInboxItem> = ReviewPage(
        total = body.int("total"),
        items = body.array("items").mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val uid = item.string("uid") ?: return@mapNotNull null
            val text = item.string("title")?.takeIf { it.isNotBlank() } ?: item.string("content").orEmpty()
            ReviewInboxItem(uid, text, item.instant("created_at"))
        },
    )

    fun projects(body: JsonObject): ReviewPage<ReviewProject> = ReviewPage(
        total = body.int("total"),
        items = body.array("items").mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val project = item["project"] as? JsonObject ?: return@mapNotNull null
            val uid = project.string("uid") ?: return@mapNotNull null
            ReviewProject(
                uid = uid,
                name = project.string("name").orEmpty(),
                reasons = item.array("reasons").mapNotNull { reason ->
                    val wire = (reason as? JsonPrimitive)?.contentOrNull
                    ProjectReason.entries.firstOrNull { it.wire == wire }
                },
                openTasks = item.int("open_tasks"),
                lastActivityAt = item.instant("last_activity_at"),
            )
        },
    )

    fun dormantProjects(body: JsonObject): List<DormantProject> = body.array("projects").mapNotNull { element ->
        val item = element as? JsonObject ?: return@mapNotNull null
        val uid = item.string("uid") ?: return@mapNotNull null
        DormantProject(uid, item.string("name").orEmpty(), item.instant("last_activity_at"))
    }

    fun week(body: JsonObject): ReviewWeek = ReviewWeek(
        weekStart = body.day("week_start"),
        committed = body.array("committed").mapNotNull { (it as? JsonObject)?.let(::task) },
        inView = body.array("in_view").mapNotNull { (it as? JsonObject)?.let(::task) },
        plannedMinutes = body.int("planned_minutes"),
        unestimated = body.int("unestimated"),
        capacityMinutes = (body["capacity_minutes"] as? JsonPrimitive)?.intOrNull,
    )

    fun postponements(body: JsonObject): Postponements = Postponements(
        recentCount = body.int("recent_count"),
        totalCount = body.int("total_count"),
        lastPostponedOn = body.day("last_postponed_on"),
        changes = body.array("changes").mapNotNull { element ->
            val change = element as? JsonObject ?: return@mapNotNull null
            ScheduleChange(
                kind = change.string("kind").orEmpty(),
                from = change.day("from"),
                to = change.day("to"),
                at = change.day("at"),
            )
        },
        missedDays = body.array("missed_days").mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.let(::parseDay) },
    )

    private fun task(task: JsonObject): ReviewTask? {
        val uid = task.string("uid") ?: return null
        return ReviewTask(
            uid = uid,
            name = task.string("original_name") ?: task.string("name").orEmpty(),
            projectName = (task["Project"] as? JsonObject)?.string("name"),
            estimatedMinutes = (task["estimated_minutes"] as? JsonPrimitive)?.intOrNull,
            reviewOn = task.day("review_on"),
            reviewedAt = task.instant("reviewed_at"),
            lastActivityAt = task.instant("updated_at"),
        )
    }

    private fun push(push: JsonObject) = PushSummary(
        recentCount = push.int("recent_count"),
        totalCount = push.int("total_count"),
        lastPostponedOn = push.day("last_postponed_on"),
        lastPlannedFor = push.day("last_planned_for"),
    )

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.int(key: String): Int = (this[key] as? JsonPrimitive)?.intOrNull ?: 0

    private fun JsonObject.bool(key: String): Boolean = string(key) == "true"

    private fun JsonObject.obj(key: String): JsonObject = this[key] as? JsonObject ?: JsonObject(emptyMap())

    private fun JsonObject.array(key: String): JsonArray = this[key] as? JsonArray ?: JsonArray(emptyList())

    private fun JsonObject.day(key: String): LocalDate? = string(key)?.let(::parseDay)

    private fun JsonObject.instant(key: String): Instant? =
        string(key)?.let { runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }

    private fun parseDay(raw: String): LocalDate? = runCatching { LocalDate.parse(raw.take(DAY_LENGTH)) }.getOrNull()

    private const val DAY_LENGTH = 10
}
