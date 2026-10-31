package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HabitSyncOutboxEntity
import ch.nicolab.cadence.data.local.entities.HabitSyncStateEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitSyncDao {
    /** Date de la dernière écriture en attente : sert à demander une synchro, la valeur ne sert que de porteur. */
    @Query("SELECT COALESCE(MAX(changedMs), 0) FROM habit_sync_outbox")
    fun observeLastChange(): Flow<Long>

    @Query("SELECT COUNT(*) FROM habit_sync_outbox")
    suspend fun pendingCount(): Int

    @Query("SELECT field FROM habit_sync_outbox WHERE entity = :entity AND uid = :uid")
    suspend fun pendingFields(entity: String, uid: String): List<String>

    /** Les champs en attente d'une entité, ceux d'une même ligne côte à côte. */
    @Query("SELECT * FROM habit_sync_outbox WHERE entity = :entity ORDER BY uid, field LIMIT :limit")
    suspend fun pendingOf(entity: String, limit: Int): List<HabitSyncOutboxEntity>

    /** Ne retire que l'écriture qui vient d'être envoyée : une plus récente reste en attente. */
    @Query("DELETE FROM habit_sync_outbox WHERE entity = :entity AND uid = :uid AND field = :field AND changedMs = :changedMs")
    suspend fun clear(entity: String, uid: String, field: String, changedMs: Long)

    @Query("DELETE FROM habit_sync_outbox WHERE entity = :entity AND uid = :uid")
    suspend fun clearRow(entity: String, uid: String)

    @Query("DELETE FROM habit_sync_outbox")
    suspend fun clearAll()

    /** Écritures de référence, sans prétention : elles perdent contre tout ce que le serveur connaît déjà. */
    @Query("UPDATE habit_sync_outbox SET changedMs = :changedMs WHERE entity = :entity AND uid IN (:uids)")
    suspend fun restamp(entity: String, uids: List<String>, changedMs: Long)

    @Query("SELECT value FROM habit_sync_state WHERE `key` = :key")
    suspend fun state(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putState(state: HabitSyncStateEntity)

    @Query("DELETE FROM habit_sync_state WHERE `key` = :key")
    suspend fun deleteState(key: String)
}
