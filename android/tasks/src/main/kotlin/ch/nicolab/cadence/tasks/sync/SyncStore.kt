package ch.nicolab.cadence.tasks.sync

import kotlinx.serialization.json.JsonElement
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

/**
 * Champ d'une opération envoyée dont le serveur a gardé sa valeur, plus récente ([server]) : [local] est ce
 * que le téléphone avait écrit et qui a été écarté. Null pour [server] si la ligne n'a pas pu être relue.
 */
data class ConflictRecord(
    val entity: String,
    val uid: String,
    val field: String,
    val local: JsonElement,
    val server: JsonElement?,
    val opId: String,
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

    /**
     * Entités dont l'instantané a été reçu depuis le curseur courant. Null : inconnu (installation antérieure),
     * toutes sont supposées reçues. Une entité que le serveur apprend plus tard est alors téléchargée seule.
     */
    suspend fun snapshottedEntities(): Set<String>? = null
    suspend fun saveSnapshottedEntities(entities: Set<String>) {}

    /** Conflit perdu par le téléphone, pour la liste « Conflits » de Réglages. */
    suspend fun recordConflict(conflict: ConflictRecord) {}

    /** Appels hors protocole en attente, dans l'ordre où ils ont été faits. */
    suspend fun deferredCalls(): List<DeferredCall> = emptyList()
    suspend fun removeDeferredCall(key: String) {}
    /** Erreur passagère du serveur : l'appel reste en file pour le prochain passage. */
    suspend fun failDeferredCall(call: DeferredCall, message: String) {}
    /** Refus définitif (HTTP 4xx) : retiré de la file et noté avec les autres refus. */
    suspend fun rejectDeferredCall(call: DeferredCall, reason: String) {}
}
