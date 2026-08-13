package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity
import ch.nicolab.cadence.data.local.model.HabitWithGoalAndSchedule
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitDao {
    @Transaction
    @Query("SELECT * FROM habits")
    fun observeHabitsWithGoalAndSchedule(): Flow<List<HabitWithGoalAndSchedule>>

    @Transaction
    @Query("SELECT * FROM habits")
    suspend fun getAllHabitsWithGoalAndSchedule(): List<HabitWithGoalAndSchedule>

    @Query("SELECT * FROM habits WHERE id = :id")
    suspend fun getHabitById(id: String): HabitEntity?

    @Transaction
    @Query("SELECT * FROM habits WHERE id = :id")
    suspend fun getHabitWithGoalAndScheduleById(id: String): HabitWithGoalAndSchedule?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertHabit(habit: HabitEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGoal(goal: HabitGoalEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSchedule(schedule: HabitScheduleEntity)

    @Update
    suspend fun updateHabit(habit: HabitEntity)

    @Update
    suspend fun updateGoal(goal: HabitGoalEntity)

    @Update
    suspend fun updateSchedule(schedule: HabitScheduleEntity)

    @Query("DELETE FROM habits WHERE id = :id")
    suspend fun deleteHabit(id: String)
}
