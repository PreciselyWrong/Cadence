package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitReminderDao {
    @Query("SELECT * FROM habit_reminders WHERE habitId = :habitId")
    fun observeReminders(habitId: String): Flow<List<HabitReminderEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReminder(reminder: HabitReminderEntity)

    @Query("DELETE FROM habit_reminders WHERE id = :id")
    suspend fun deleteReminder(id: String)
}
