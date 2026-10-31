package ch.nicolab.cadence.data.sync

import kotlinx.serialization.json.JsonObject

/** Issue de l'application d'une ligne serveur. */
sealed interface ApplyResult {
    /** [replacedEntryUid] : entrée Health Connect devenue doublon quand le serveur impose la sienne. */
    data class Applied(val replacedEntryUid: String? = null) : ApplyResult

    /** Ligne ignorée : parent absent, ou modification locale en attente sur la ligne qui occupe la clé naturelle. */
    data class Skipped(val reason: String) : ApplyResult
}

/**
 * Ce dont la synchro a besoin des habitudes stockées sur l'appareil. Les lignes circulent en
 * `Map<colonne, valeur>` (voir [EntitySpec]) ; l'implémentation Room est [RoomHabitSyncStorage].
 */
interface HabitSyncStorage {
    /** Les écritures en attente, au plus [maxRows] lignes, jamais une ligne coupée en deux. Parents d'abord. */
    suspend fun pendingEntries(maxRows: Int): List<OutboxEntry>

    suspend fun row(entity: String, uid: String): Map<String, Any?>?

    /** Retire ces écritures (et seulement elles : une écriture plus récente du même champ reste). */
    suspend fun clear(entries: Collection<OutboxEntry>)

    /**
     * Enregistre une ligne reçue du serveur sans créer d'écriture en attente. Les champs encore à
     * envoyer gardent leur valeur locale ; une ligne dont la suppression attend n'est pas recréée.
     */
    suspend fun apply(entity: String, data: JsonObject): ApplyResult

    /** Supprime une ligne sur ordre du serveur (ses enfants suivent par cascade) et oublie ses écritures. */
    suspend fun delete(entity: String, uid: String)

    /** Supprime localement une entrée devenue doublon : suppression normale, donc envoyée au serveur. */
    suspend fun deleteEntry(entryUid: String)

    /** Nom à montrer pour une écriture refusée (l'habitude concernée, ou le groupe). */
    suspend fun displayName(entity: String, uid: String): String?

    /** Note tous les champs de toutes les lignes comme à envoyer. */
    suspend fun markAllDirty()

    /** Retient la plus haute horloge serveur vue, en ms : les écritures suivantes la dépassent. */
    suspend fun raiseClockFloor(ms: Long)

    /** Émet la date de la dernière écriture en attente ; sert à demander une synchro après une saisie. */
    fun observeLastChange(): kotlinx.coroutines.flow.Flow<Long>
}
