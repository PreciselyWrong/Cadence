package ch.nicolab.cadence.tasks.sync

import java.io.IOException
import kotlinx.serialization.json.JsonObject

/** Réponse du serveur de forme inattendue (page HTML, JSON incomplet) : réessayable comme une panne réseau. */
class ProtocolError(cause: Throwable? = null) : IOException("Réponse inattendue du serveur", cause)

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

/** Compte du jeton : son courriel et son fuseau horaire (`timezone`, ex. "Europe/Zurich"). */
data class AccountProfile(val email: String?, val timezone: String?)

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
