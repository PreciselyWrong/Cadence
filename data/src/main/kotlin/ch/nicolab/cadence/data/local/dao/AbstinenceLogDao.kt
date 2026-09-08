package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.AbstinenceLogEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AbstinenceLogDao {
    @Query("SELECT * FROM abstinence_logs WHERE habitId = :habitId ORDER BY occurredAtEpochMs DESC, id")
    suspend fun getLogs(habitId: String): List<AbstinenceLogEntity>

    @Query("SELECT * FROM abstinence_logs ORDER BY occurredAtEpochMs, id")
    suspend fun getAllLogs(): List<AbstinenceLogEntity>

    @Query("SELECT * FROM abstinence_logs WHERE id = :id")
    suspend fun getLog(id: String): AbstinenceLogEntity?

    @Query("SELECT COUNT(*) FROM abstinence_logs")
    fun observeRevision(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(log: AbstinenceLogEntity)

    @Query("DELETE FROM abstinence_logs WHERE id = :id")
    suspend fun delete(id: String)
}
