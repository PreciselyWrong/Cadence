package ch.nicolab.cadence.tasks.todomd

import ch.nicolab.cadence.tasks.model.TodoMdRepo
import ch.nicolab.cadence.tasks.model.TodoMdRepos
import java.net.URLEncoder
import kotlinx.serialization.json.JsonObject

/**
 * État des dépôts git des projets TODO.md, lu en ligne (`/api/v1/todo-md/…`, docs/35-todo-md-projects.md) : ni
 * la synchro hors ligne ni la file d'envoi ne le portent. Hors ligne ou pour un autre compte, rien à montrer.
 */
class TodoMdClient internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
) {
    suspend fun status(): Result<List<TodoMdRepo>> = runCatching {
        TodoMdRepos.parseStatus(call("GET", "/api/v1/todo-md/status", emptyMap(), null))
    }

    /** Rejoue les modifications en attente du dépôt, dans l'ordre ; rend l'état qui en résulte. */
    suspend fun retry(slug: String): Result<TodoMdRepo?> = act(slug, "retry")

    /** Oublie les modifications en attente et relit le dépôt. */
    suspend fun discard(slug: String): Result<TodoMdRepo?> = act(slug, "discard")

    private suspend fun act(slug: String, action: String): Result<TodoMdRepo?> = runCatching {
        TodoMdRepos.parseRepo(call("POST", "/api/v1/todo-md/repos/${URLEncoder.encode(slug, "UTF-8").replace("+", "%20")}/$action", emptyMap(), null))
    }
}
