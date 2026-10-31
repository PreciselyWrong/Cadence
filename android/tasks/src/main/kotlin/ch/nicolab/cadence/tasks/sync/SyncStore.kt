package ch.nicolab.cadence.tasks.sync

import kotlinx.serialization.json.JsonObject

/** Une opération en attente d'envoi, telle que [SyncApi.push] la reçoit. */
data class OutboxOp(
    val opId: String,
    val entity: String,
    val uid: String,
    val action: String,
    val payload: JsonObject,
    val attempts: Int = 0,
)

/** Ce dont le moteur a besoin du stockage local ; les lignes sont au format serveur. */
interface SyncStore {
    /** Null tant que le premier instantané n'est pas complet. */
    suspend fun cursor(): Long?
    suspend fun saveCursor(cursor: Long?)

    /** Vide les lignes synchronisées, en gardant celles qui ont une modification en attente. */
    suspend fun clearSyncedRows()

    /** Enregistre une ligne serveur, en réappliquant les modifications locales en attente. */
    suspend fun applyServerRow(entity: String, data: JsonObject)
    suspend fun deleteRow(entity: String, uid: String)

    suspend fun pendingOps(limit: Int): List<OutboxOp>
    suspend fun removeOps(opIds: List<String>)
    suspend fun recordFailure(opIds: List<String>, message: String)
    suspend fun recordRejected(op: OutboxOp, reason: String?)
    /**
     * Vrai (défaut) : une création refusée que le serveur ne connaît pas est retirée de l'appareil.
     * Faux pour les habitudes, saisies de la personne : le refus est montré, la ligne reste.
     */
    fun discardsRejectedCreation(entity: String): Boolean = true

    /** Le téléphone se connecte à un autre serveur : ce qu'il contient doit lui être renvoyé en entier. */
    suspend fun serverChanged() {}

    suspend fun saveClock(state: String)
    suspend fun markSynced(atMs: Long)
}
