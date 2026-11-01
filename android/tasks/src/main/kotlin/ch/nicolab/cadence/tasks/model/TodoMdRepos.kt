package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Une modification faite dans Cadence qui n'a pas atteint le dépôt ; [reason] : `conflict` ou `unreachable`. */
data class TodoMdPendingEdit(val name: String?, val reason: String?)

/** État d'un dépôt git qui porte un projet TODO.md (`GET /api/todo-md/status`, `repos[]`, compte propriétaire seulement). */
data class TodoMdRepo(
    val slug: String,
    val repo: String,
    val projectUid: String?,
    val syncedAt: Instant?,
    val lastError: String?,
    val pending: List<TodoMdPendingEdit>,
)

/** Ligne d'état sous l'en-tête du projet, dans l'ordre de priorité du web (`TodoMdRepoSync.tsx`). */
sealed interface TodoMdLine {
    /** « Réessayer » et « Abandonner » ne s'offrent que s'il reste des modifications en attente. */
    val needsAction: Boolean get() = this is Conflict || this is Pending

    data class Conflict(val name: String) : TodoMdLine
    data class Pending(val count: Int) : TodoMdLine
    data class Error(val repo: String, val error: String) : TodoMdLine
    data class Synced(val repo: String, val at: Instant) : TodoMdLine
    data class NotSynced(val repo: String) : TodoMdLine
}

/** Projets TODO.md tirés d'un dépôt git (docs/35-todo-md-projects.md), sans Android : lecture, ligne d'état, refus lisibles. */
object TodoMdRepos {
    const val CONFLICT = "todo_md_conflict"
    const val UNREACHABLE = "todo_md_repo_unreachable"

    fun parseStatus(body: JsonObject): List<TodoMdRepo> =
        (body["repos"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::parseRepo) }

    /** Un dépôt, tel que `GET /api/todo-md/status` le liste ou que « Réessayer » / « Abandonner » le renvoie. */
    fun parseRepo(body: JsonObject): TodoMdRepo? {
        val slug = body.text("slug") ?: return null
        return TodoMdRepo(
            slug = slug,
            repo = body.text("repo") ?: slug,
            projectUid = body.text("project_uid"),
            syncedAt = body.text("synced_at")?.let { runCatching { Instant.parse(it) }.getOrNull() },
            lastError = body.text("last_error"),
            pending = (body["pending"] as? JsonArray).orEmpty().mapNotNull { entry ->
                (entry as? JsonObject)?.let { TodoMdPendingEdit(it.text("name"), it.text("reason")) }
            },
        )
    }

    fun forProject(repos: List<TodoMdRepo>, projectUid: String): TodoMdRepo? = repos.firstOrNull { it.projectUid == projectUid }

    fun line(repo: TodoMdRepo): TodoMdLine {
        val conflict = repo.pending.firstOrNull { it.reason == "conflict" }
        return when {
            conflict != null -> TodoMdLine.Conflict(conflict.name.orEmpty())
            repo.pending.isNotEmpty() -> TodoMdLine.Pending(repo.pending.size)
            repo.lastError != null -> TodoMdLine.Error(repo.repo, repo.lastError)
            repo.syncedAt != null -> TodoMdLine.Synced(repo.repo, repo.syncedAt)
            else -> TodoMdLine.NotSynced(repo.repo)
        }
    }

    fun text(line: TodoMdLine, now: Instant, zone: ZoneId): String = when (line) {
        is TodoMdLine.Conflict -> "Conflit : « ${line.name} » a changé dans le dépôt, rien n'a été écrit."
        is TodoMdLine.Pending ->
            if (line.count == 1) "1 modification en attente : le dépôt est injoignable."
            else "${line.count} modifications en attente : le dépôt est injoignable."
        is TodoMdLine.Error -> "Synchronisation impossible avec ${line.repo} : ${line.error}"
        is TodoMdLine.Synced -> "Synchronisé avec ${line.repo} · ${SyncStatusText.ago(line.at, now, zone)}"
        is TodoMdLine.NotSynced -> "Pas encore synchronisé avec ${line.repo}"
    }

    /** Ce que veut dire un refus d'envoi du serveur sur une tâche TODO.md ; null pour tout autre refus. */
    fun rejection(reason: String?): String? = when (reason) {
        CONFLICT -> "La ligne a changé dans le dépôt : rien n'a été écrit (TODO.md)."
        UNREACHABLE -> "Dépôt injoignable : la modification attend sur le serveur (TODO.md)."
        else -> null
    }

    /** Message d'un passage dont des envois ont été refusés, quand l'un d'eux vient d'un dépôt TODO.md. */
    fun rejectionSummary(reasons: List<String?>): String? {
        val texts = reasons.mapNotNull(::rejection).distinct()
        if (texts.isEmpty()) return null
        val detail = texts.joinToString(" ")
        return if (reasons.size == 1) detail else "${reasons.size} modifications refusées par le serveur · $detail"
    }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
}
