package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HabitTimerEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitTimerDao {
    @Query("SELECT * FROM habit_timers")
    fun observeTimers(): Flow<List<HabitTimerEntity>>

    @Query("SELECT * FROM habit_timers")
    suspend fun getTimers(): List<HabitTimerEntity>

    @Query("SELECT * FROM habit_timers WHERE habitId = :habitId")
    suspend fun getTimer(habitId: String): HabitTimerEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(timer: HabitTimerEntity)

    @Query("DELETE FROM habit_timers WHERE habitId = :habitId")
    suspend fun delete(habitId: String)
}
