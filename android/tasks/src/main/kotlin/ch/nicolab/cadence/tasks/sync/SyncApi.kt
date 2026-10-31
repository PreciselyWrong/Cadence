package ch.nicolab.cadence.tasks.sync

import ch.nicolab.cadence.domain.QuietHours
import java.io.IOException
import kotlinx.serialization.json.JsonObject

/** Réponse du serveur de forme inattendue (page HTML, JSON incomplet) : réessayable comme une panne réseau. */
class ProtocolError(cause: Throwable? = null) : IOException("Réponse inattendue du serveur", cause)

/** Le journal du serveur ne remonte plus jusqu'au curseur (HTTP 410) : il faut reprendre un instantané. */
class ResetRequired : IOException("Curseur trop ancien, instantané requis")

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
)

data class PushResult(val opId: String, val status: String, val reason: String?)

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

    /** Déplace une occurrence récurrente ; demande le réseau, pas de file d'attente. */
    suspend fun moveOccurrence(uid: String, scope: String, occurrenceDate: String, dueDate: String)
}
