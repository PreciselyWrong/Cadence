package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HabitPauseEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitPauseDao {
    @Query("SELECT * FROM habit_pauses ORDER BY habitId, start")
    suspend fun getAllPauses(): List<HabitPauseEntity>
    @Query("SELECT * FROM habit_pauses WHERE habitId = :habitId ORDER BY start ASC")
    fun observePauses(habitId: String): Flow<List<HabitPauseEntity>>

    @Query("SELECT * FROM habit_pauses WHERE habitId = :habitId ORDER BY start ASC")
    suspend fun getPauses(habitId: String): List<HabitPauseEntity>

    @Query("SELECT * FROM habit_pauses WHERE id = :id")
    suspend fun getPauseById(id: String): HabitPauseEntity?

    @Query("SELECT * FROM habit_pauses WHERE habitId = :habitId AND endExclusive IS NULL")
    suspend fun getOpenPauses(habitId: String): List<HabitPauseEntity>

    /** Émet à chaque pause ou saut écrit, quel que soit le processus d'origine. */
    @Query("SELECT COUNT(*) FROM habit_pauses")
    fun observePauseRevision(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPause(pause: HabitPauseEntity)

    @Query("DELETE FROM habit_pauses WHERE id = :id")
    suspend fun deletePause(id: String)
}
