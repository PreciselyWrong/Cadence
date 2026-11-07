package ch.nicolab.cadence.tasks.autoclassify

import ch.nicolab.cadence.tasks.sync.DeferredCall
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private const val SETTINGS = "/api/v1/auto-classify/settings"
private const val DRY_RUN = "/api/v1/auto-classify/dry-run"
private const val MARKS = "/api/v1/auto-classify/marks"
private const val CHANGES = "/api/v1/auto-classify/changes"
private const val SUGGESTIONS = "/api/v1/auto-classify/suggestions"

/** Réglages du classement tels que le serveur les renvoie, avec ses valeurs par défaut. */
class ClassifySettings(
    val values: JsonObject,
    val defaults: JsonObject,
    val aiConfigured: Boolean,
) {
    val notify: Boolean get() = values.boolean("notify") ?: true

    companion object {
        fun of(body: JsonObject) = ClassifySettings(
            values = body["settings"] as? JsonObject ?: JsonObject(emptyMap()),
            defaults = body["defaults"] as? JsonObject ?: JsonObject(emptyMap()),
            aiConfigured = body.boolean("ai_configured") == true,
        )
    }
}

/** Résultat de l'essai à blanc : ce qui serait classé sur les éléments examinés, rien n'est écrit. */
data class DryRunResult(val considered: Int, val wouldChange: Int, val error: String?) {
    companion object {
        fun of(body: JsonObject): DryRunResult = DryRunResult(
            considered = (body["considered"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 0,
            wouldChange = (body["results"] as? JsonArray)?.size ?: 0,
            error = (body["error"] as? JsonPrimitive)?.content,
        )
    }
}

/** Appels de la file « À trier » et des notifications : rejoués hors ligne, une réponse par suggestion. */
internal object AutoClassifyRequests {
    const val ACTION_ACCEPT_ALL = "ch.nicolab.cadence.tasks.autoclassify.ACCEPT_ALL"
    const val ACTION_DISMISS = "ch.nicolab.cadence.tasks.autoclassify.DISMISS"
    const val ACTION_DROP_NEW = "ch.nicolab.cadence.tasks.autoclassify.DROP_NEW"
    const val ACTION_MERGE = "ch.nicolab.cadence.tasks.autoclassify.MERGE"

    /** Une réponse remplace la précédente pour la même suggestion : seule la dernière part. */
    fun key(suggestionUid: String) = "auto-classify:$suggestionUid"

    fun apply(suggestionUid: String, choice: JsonElement, label: String) = DeferredCall(
        key = key(suggestionUid),
        method = "POST",
        path = "$SUGGESTIONS/$suggestionUid/apply",
        body = buildJsonObject { put("choice", choice) },
        label = label,
    )

    fun dismiss(suggestionUid: String, label: String) = DeferredCall(
        key = key(suggestionUid),
        method = "POST",
        path = "$SUGGESTIONS/$suggestionUid/dismiss",
        body = JsonObject(emptyMap()),
        label = label,
    )

    /** Action d'une notification vers son appel ; null pour une action inconnue. */
    fun forNotificationAction(action: String?, suggestionUid: String, label: String): DeferredCall? = when (action) {
        ACTION_ACCEPT_ALL -> apply(suggestionUid, AutoClassifyChoices.ACCEPT_ALL, label)
        ACTION_DISMISS -> dismiss(suggestionUid, label)
        ACTION_DROP_NEW -> apply(suggestionUid, AutoClassifyChoices.duplicate("drop_new"), label)
        ACTION_MERGE -> apply(suggestionUid, AutoClassifyChoices.duplicate("merge"), label)
        else -> null
    }
}

/**
 * Classement automatique : réglages, marques et annulation, suggestions. Les lectures passent en ligne seulement ;
 * les réponses partent par [defer] (file d'appels différés, rejouée à la synchro).
 */
class AutoClassifyRepository internal constructor(
    private val call: suspend (method: String, path: String, query: Map<String, String>, body: JsonObject?) -> JsonObject,
    private val defer: suspend (DeferredCall) -> Unit,
) {
    suspend fun settings(): Result<ClassifySettings> = runCatchingIo { ClassifySettings.of(call("GET", SETTINGS, emptyMap(), null)) }

    /** [patch] : seulement les champs à changer ; le serveur valide chaque valeur (400 sinon). */
    suspend fun save(patch: JsonObject): Result<ClassifySettings> =
        runCatchingIo { ClassifySettings.of(call("PUT", SETTINGS, emptyMap(), patch)) }

    suspend fun dryRun(days: Int = DRY_RUN_DAYS): Result<DryRunResult> = runCatchingIo {
        DryRunResult.of(call("POST", DRY_RUN, emptyMap(), buildJsonObject { put("days", days) }))
    }

    suspend fun marks(entity: String, uid: String): Result<List<ClassifyMark>> = runCatchingIo {
        val body = call("GET", MARKS, mapOf("entity" to entity, "uid" to uid), null)
        (body["marks"] as? JsonArray)?.toList().orEmpty().mapNotNull(ClassifyMark::parse)
    }

    /** 409 : l'élément a changé depuis le classement, l'annulation n'est plus possible. */
    suspend fun undo(changeId: Long): Result<Unit> = runCatchingIo {
        call("POST", "$CHANGES/$changeId/undo", emptyMap(), JsonObject(emptyMap()))
        Unit
    }

    suspend fun suggestions(): Result<List<PendingSuggestion>> = runCatchingIo {
        val body = call("GET", SUGGESTIONS, emptyMap(), null)
        (body["suggestions"] as? JsonArray)?.toList().orEmpty().mapNotNull(PendingSuggestion::parse)
    }

    /** Une réponse à la file ; elle part à la prochaine synchro, même hors ligne. */
    suspend fun answer(call: DeferredCall) = defer(call)

    private suspend fun <T> runCatchingIo(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    companion object {
        const val DRY_RUN_DAYS = 7
    }
}
