package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitQuickValueDao {
    @Query("SELECT * FROM habit_quick_values ORDER BY habitId, sortOrder")
    suspend fun getAllQuickValues(): List<HabitQuickValueEntity>
    @Query("SELECT * FROM habit_quick_values WHERE habitId = :habitId ORDER BY sortOrder ASC")
    fun observeQuickValues(habitId: String): Flow<List<HabitQuickValueEntity>>

    @Query("SELECT * FROM habit_quick_values WHERE habitId = :habitId ORDER BY sortOrder ASC")
    suspend fun getQuickValues(habitId: String): List<HabitQuickValueEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQuickValue(quickValue: HabitQuickValueEntity)

    @Query("DELETE FROM habit_quick_values WHERE id = :id")
    suspend fun deleteQuickValue(id: String)
}
