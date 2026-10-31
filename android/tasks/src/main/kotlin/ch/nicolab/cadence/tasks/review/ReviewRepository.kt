package ch.nicolab.cadence.tasks.review

import java.io.File
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** Réponse lue en ligne, ou la dernière gardée quand le serveur ne répond pas ([fromCache]). */
data class Loaded<T>(val value: T, val fetchedAt: Instant, val fromCache: Boolean)

/** Dernière réponse de chaque liste, gardée en fichier pour relire la revue hors ligne. */
internal class ReviewCache(private val dir: File) {
    fun write(key: String, body: JsonObject, at: Instant) {
        dir.mkdirs()
        val file = fileOf(key)
        file.writeText(body.toString())
        file.setLastModified(at.toEpochMilli())
    }

    fun read(key: String): Pair<JsonObject, Instant>? {
        val file = fileOf(key)
        if (!file.isFile) return null
        val body = runCatching { Json.parseToJsonElement(file.readText()).jsonObject }.getOrNull() ?: return null
        return body to Instant.ofEpochMilli(file.lastModified())
    }

    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }

    private fun fileOf(key: String) = File(dir, key.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".json")
}

/**
 * Listes de la revue, calculées par le serveur (`/api/review*`) : le téléphone ne recode ni le classement
 * des déplacements ni la règle des projets stagnants. En ligne seulement ; hors ligne, la dernière lecture
 * est rendue telle quelle. Les décisions sur les tâches passent par la file d'envoi (`TaskRepository`).
 */
class ReviewRepository internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val cache: ReviewCache,
    private val now: () -> Instant = Instant::now,
) {
    suspend fun summary(): Result<Loaded<ReviewSummary>> = read("summary", "/api/v1/review", ReviewJson::summary)

    suspend fun tasks(step: ReviewStep): Result<Loaded<ReviewPage<ReviewTask>>> {
        require(step == ReviewStep.PUSHED || step == ReviewStep.LATER || step == ReviewStep.STALE)
        return read(step.wire, "/api/v1/review/${step.wire}", ReviewJson::tasks, PAGE)
    }

    suspend fun inbox(): Result<Loaded<ReviewPage<ReviewInboxItem>>> =
        read(ReviewStep.UNDECIDED.wire, "/api/v1/review/undecided", ReviewJson::inbox, PAGE)

    suspend fun projects(): Result<Loaded<ReviewPage<ReviewProject>>> =
        read(ReviewStep.PROJECTS.wire, "/api/v1/review/projects", ReviewJson::projects, PAGE)

    suspend fun week(): Result<Loaded<ReviewWeek>> = read(ReviewStep.WEEK.wire, "/api/v1/review/week", ReviewJson::week)

    suspend fun postponements(taskUid: String): Result<Loaded<Postponements>> =
        read("postponements-$taskUid", "/api/v1/task/${encode(taskUid)}/postponements", ReviewJson::postponements)

    /** Temps disponible de la semaine (`ui_settings.planning.weekCapacityMinutes`) ; null le retire. */
    suspend fun saveWeekCapacity(minutes: Int?): Result<Unit> = write {
        val body = JsonObject(mapOf("capacity_minutes" to (minutes?.let { JsonPrimitive(it) } ?: JsonNull)))
        call("PUT", "/api/v1/review/week/capacity", emptyMap(), body)
    }

    /** « Garder tel quel » pour un projet stagnant (`projects.reviewed_at`), qui n'est pas synchronisé. */
    suspend fun keepProject(uid: String): Result<Unit> = write {
        call("POST", "/api/v1/project/${encode(uid)}/reviewed", emptyMap(), JsonObject(emptyMap()))
    }

    /** Le serveur a-t-il déjà une routine de revue hebdomadaire ? En ligne seulement : jamais gardé en cache. */
    suspend fun weeklyRoutineExists(): Result<Boolean> = try {
        val body = call("GET", "/api/v1/review/weekly-routine", emptyMap(), null)
        Result.success((body["exists"] as? JsonPrimitive)?.contentOrNull == "true")
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    /** Crée la tâche récurrente du vendredi ; idempotent côté serveur. Jamais automatique. */
    suspend fun planWeeklyRoutine(name: String): Result<Unit> = write {
        call("POST", "/api/v1/review/weekly-routine", emptyMap(), JsonObject(mapOf("name" to JsonPrimitive(name))))
    }

    private suspend fun <T> read(
        key: String,
        path: String,
        parse: (JsonObject) -> T,
        query: Map<String, String> = emptyMap(),
    ): Result<Loaded<T>> {
        val online = try {
            call("GET", path, query, null)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val cached = withContext(Dispatchers.IO) { cache.read(key) }
                ?: return Result.failure(if (error is IOException) error else IOException(error.message, error))
            return Result.success(Loaded(parse(cached.first), cached.second, fromCache = true))
        }
        val at = now()
        withContext(Dispatchers.IO) { cache.write(key, online, at) }
        return Result.success(Loaded(parse(online), at, fromCache = false))
    }

    private suspend fun write(block: suspend () -> Unit): Result<Unit> = try {
        block()
        Result.success(Unit)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    private companion object {
        val PAGE = mapOf("limit" to "100")
    }
}
