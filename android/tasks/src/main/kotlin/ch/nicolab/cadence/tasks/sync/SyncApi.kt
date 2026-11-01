package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.domain.QuietHours
import java.io.IOException
import kotlinx.serialization.json.JsonObject

/** Réponse du serveur de forme inattendue (page HTML, JSON incomplet) : réessayable comme une panne réseau. */
class ProtocolError(cause: Throwable? = null) : IOException("Réponse inattendue du serveur", cause)

/** Le journal du serveur ne remonte plus jusqu'au curseur (HTTP 410) : il faut reprendre un instantané. */
class ResetRequired : IOException("Curseur trop ancien, instantané requis")

/**
 * Le serveur a répondu, mais par une erreur HTTP (hors 401/403 et 410 `reset_required`) : il est joignable.
 * [error] est le code d'erreur lu dans le corps (`{"error": "unknown_entity"}`), s'il y en a un.
 */
class HttpError(val code: Int, val error: String?) :
    IOException(if (error == null) "HTTP $code" else "HTTP $code : $error") {
    /** Erreur propre à la requête (corps refusé) : une autre requête peut réussir. */
    val isClientError get() = code in 400..499 && code != 404 && code != 408 && code != 429

    /** Panne passagère du serveur ou de son proxy : rien à isoler, on réessaie plus tard. */
    val isUnavailable get() = code == 502 || code == 503 || code == 504 || code == 408 || code == 429
}

/** Clé API refusée ou absente : il faut que l'utilisateur la renouvelle. */
class AuthError(message: String) : Exception(message)

/** Adresse et clé d'un serveur ; le jeton n'apparaît jamais dans `toString`. */
class ServerSession(val baseUrl: String, val token: String) {
    override fun toString() = "ServerSession($baseUrl)"
}

data class SnapshotPage(val cursor: Long, val next: Long?, val rows: List<JsonObject>)

data class RemoteChange(
    val seq: Long,
    val entity: String,
    val uid: String,
    val op: String,
    val data: JsonObject?,
    val opId: String?,
)

data class PullPage(val cursor: Long, val hasMore: Boolean, val changes: List<RemoteChange>)

/**
 * Compte du jeton : son courriel, son fuseau horaire (`timezone`, ex. "Europe/Zurich") et le premier jour
 * de sa semaine (`first_day_of_week`, 0 = dimanche), qui fixe « Cette semaine », et sa plage silencieuse
 * (`quiet_hours`, heure du fuseau du compte) que les alarmes locales respectent.
 */
data class AccountProfile(
    val email: String?,
    val timezone: String?,
    val firstDayOfWeek: Int? = null,
    val quietHours: QuietHours? = null,
    /** `uid` du compte : avec l'adresse du serveur, il dit à qui appartiennent les habitudes du téléphone. */
    val uid: String? = null,
)

/** [rejectedFields] : champs d'un `conflict` dont la valeur du serveur, plus récente, a été gardée. */
data class PushResult(
    val opId: String,
    val status: String,
    val reason: String?,
    val rejectedFields: List<String> = emptyList(),
)

/**
 * Protocole `/api/v1/sync` de Tududi. Les erreurs réseau remontent en
 * [java.io.IOException] (réessayable), une clé refusée en [AuthError].
 */
interface SyncApi {
    suspend fun meta(): JsonObject
    suspend fun profile(): AccountProfile
    suspend fun snapshot(entity: String, after: Long, cursor: Long?, limit: Int): SnapshotPage
    suspend fun pull(cursor: Long, limit: Int): PullPage
    suspend fun push(ops: List<JsonObject>): List<PushResult>

    /** Déplace une occurrence récurrente ; demande le réseau (hors ligne, l'appel passe par [send] différé). */
    suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String)

    /** Appel direct à l'API (revue, routine, déplacement d'occurrence), rejoué depuis la file des appels différés. */
    suspend fun send(method: String, path: String, body: JsonObject?): JsonObject
}
