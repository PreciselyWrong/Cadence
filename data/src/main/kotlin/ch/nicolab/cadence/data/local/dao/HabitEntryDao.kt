package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HabitEntryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitEntryDao {
    @Query("SELECT * FROM habit_entries ORDER BY occurredAtEpochMs")
    suspend fun getAllEntries(): List<HabitEntryEntity>

    @Query("SELECT * FROM habit_entries WHERE habitId = :habitId ORDER BY occurredAtEpochMs")
    suspend fun getEntriesForHabit(habitId: String): List<HabitEntryEntity>
    @Query("""
        SELECT * FROM habit_entries 
        WHERE habitId = :habitId 
        AND localDate >= :startDateInclusive 
        AND localDate <= :endDateInclusive 
        ORDER BY localDate ASC, occurredAtEpochMs ASC
    """)
    fun observeEntriesForHabit(
        habitId: String,
        startDateInclusive: String,
        endDateInclusive: String,
    ): Flow<List<HabitEntryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEntry(entry: HabitEntryEntity)

    @Query("DELETE FROM habit_entries WHERE id = :id")
    suspend fun deleteEntry(id: String)
}
