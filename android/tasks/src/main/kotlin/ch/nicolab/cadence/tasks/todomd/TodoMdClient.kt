package ch.nicolab.cadence.tasks.todomd

import ch.nicolab.cadence.tasks.model.TodoMdFile
import ch.nicolab.cadence.tasks.model.TodoMdFiles
import ch.nicolab.cadence.tasks.model.TodoMdRepo
import ch.nicolab.cadence.tasks.model.TodoMdRepos
import java.net.URLEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

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

    /** Les fichiers du serveur et le projet que chacun alimente ; échoue pour un autre compte ou si la fonction est coupée. */
    suspend fun files(): Result<List<TodoMdFile>> = runCatching {
        TodoMdFiles.parse(call("GET", "/api/v1/todo-md/files", emptyMap(), null))
    }

    /** Fait suivre au projet le TODO.md de ce dossier. */
    suspend fun link(projectUid: String, folder: String): Result<Unit> = runCatching {
        call("POST", "/api/v1/todo-md/projects/${encoded(projectUid)}/link", emptyMap(), buildJsonObject { put("folder", folder) })
        Unit
    }

    /** Le projet ne suit plus de fichier : ses tâches restent, comme des tâches ordinaires. */
    suspend fun unlink(projectUid: String): Result<Unit> = runCatching {
        call("POST", "/api/v1/todo-md/projects/${encoded(projectUid)}/unlink", emptyMap(), null)
        Unit
    }

    private fun encoded(value: String) = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    private suspend fun act(slug: String, action: String): Result<TodoMdRepo?> = runCatching {
        TodoMdRepos.parseRepo(call("POST", "/api/v1/todo-md/repos/${encoded(slug)}/$action", emptyMap(), null))
    }
}
