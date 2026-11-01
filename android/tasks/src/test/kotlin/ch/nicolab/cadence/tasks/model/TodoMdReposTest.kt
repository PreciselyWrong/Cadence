package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** Projet TODO.md d'un dépôt git : ligne d'état de `GET /api/todo-md/status` et refus d'envoi lisibles. */
class TodoMdReposTest {
    private val now = Instant.parse("2026-11-01T12:00:00Z")
    private val zone = ZoneId.of("Europe/Paris")

    private fun status(pending: String = "[]", lastError: String = "null", syncedAt: String = "\"2026-11-01T11:57:00Z\"") = Json.parseToJsonElement(
        """{"enabled":true,"last_scan":null,"repos":[
            {"slug":"cadence","repo":"git.example/nico/cadence","branch":"main","path":"TODO.md","project_uid":"p1",
             "webhook":true,"head_sha":"abc","synced_at":$syncedAt,"last_error":$lastError,"pending":$pending},
            {"slug":"other","repo":"github.com/a/b","branch":"main","path":"TODO.md","project_uid":null,
             "webhook":false,"head_sha":null,"synced_at":null,"last_error":null,"pending":[]}
        ]}""",
    ).jsonObject

    private fun lineFor(body: kotlinx.serialization.json.JsonObject) =
        TodoMdRepos.text(TodoMdRepos.line(TodoMdRepos.forProject(TodoMdRepos.parseStatus(body), "p1")!!), now, zone)

    @Test
    fun `le dépôt d'un projet se trouve par son project_uid`() {
        val repos = TodoMdRepos.parseStatus(status())
        assertEquals("cadence", TodoMdRepos.forProject(repos, "p1")?.slug)
        assertNull(TodoMdRepos.forProject(repos, "p2"))
        assertEquals(emptyList<TodoMdRepo>(), TodoMdRepos.parseStatus(Json.parseToJsonElement("""{"enabled":true,"repos":[]}""").jsonObject))
    }

    @Test
    fun `synchronisé dit quand, sans rien à faire`() {
        val repo = TodoMdRepos.forProject(TodoMdRepos.parseStatus(status()), "p1")!!
        assertEquals("Synchronisé avec git.example/nico/cadence · il y a 3 min", lineFor(status()))
        assertEquals(false, TodoMdRepos.line(repo).needsAction)
    }

    @Test
    fun `un conflit l'emporte sur l'attente et nomme la tâche`() {
        val body = status(pending = """[{"id":"1","op":"done","name":"Écrire la doc","reason":"unreachable"},{"id":"2","op":"done","name":"Fix bug","reason":"conflict"}]""")
        assertEquals("Conflit : « Fix bug » a changé dans le dépôt, rien n'a été écrit.", lineFor(body))
        assertEquals(true, TodoMdRepos.line(TodoMdRepos.parseStatus(body).first()).needsAction)
    }

    @Test
    fun `des modifications en attente disent que le dépôt est injoignable`() {
        assertEquals(
            "2 modifications en attente : le dépôt est injoignable.",
            lineFor(status(pending = """[{"id":"1","op":"create","name":"A","reason":"unreachable"},{"id":"2","op":"done","name":"B","reason":"unreachable"}]""")),
        )
        assertEquals(
            "1 modification en attente : le dépôt est injoignable.",
            lineFor(status(pending = """[{"id":"1","op":"create","name":"A","reason":"unreachable"}]""")),
        )
    }

    @Test
    fun `une erreur sans attente puis jamais synchronisé`() {
        assertEquals("Synchronisation impossible avec git.example/nico/cadence : auth failed", lineFor(status(lastError = "\"auth failed\"")))
        assertEquals("Pas encore synchronisé avec git.example/nico/cadence", lineFor(status(syncedAt = "null")))
    }

    @Test
    fun `les refus todo_md deviennent une phrase, les autres restent tels quels`() {
        assertEquals("La ligne a changé dans le dépôt : rien n'a été écrit (TODO.md).", TodoMdRepos.rejection("todo_md_conflict"))
        assertEquals("Dépôt injoignable : la modification attend sur le serveur (TODO.md).", TodoMdRepos.rejection("todo_md_repo_unreachable"))
        assertNull(TodoMdRepos.rejection("read_only"))
        assertNull(TodoMdRepos.rejection(null))
    }

    @Test
    fun `le résumé d'un passage nomme la cause TODO_md quand il y en a une`() {
        assertEquals("La ligne a changé dans le dépôt : rien n'a été écrit (TODO.md).", TodoMdRepos.rejectionSummary(listOf("todo_md_conflict")))
        assertEquals(
            "2 modifications refusées par le serveur · Dépôt injoignable : la modification attend sur le serveur (TODO.md).",
            TodoMdRepos.rejectionSummary(listOf("invalid_value:name", "todo_md_repo_unreachable")),
        )
        assertNull(TodoMdRepos.rejectionSummary(listOf("invalid_value:name")))
    }
}
