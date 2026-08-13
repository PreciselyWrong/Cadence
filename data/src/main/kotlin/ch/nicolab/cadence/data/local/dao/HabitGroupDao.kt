package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HabitGroupEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HabitGroupDao {
    @Query("SELECT * FROM habit_groups ORDER BY sortOrder ASC")
    fun observeGroups(): Flow<List<HabitGroupEntity>>

    @Query("SELECT * FROM habit_groups ORDER BY sortOrder ASC")
    suspend fun getGroups(): List<HabitGroupEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(group: HabitGroupEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(groups: List<HabitGroupEntity>)

    @Query("DELETE FROM habit_groups WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM habit_groups")
    suspend fun deleteAll()

    /** Ramène les habitudes d'un groupe supprimé vers un groupe encore existant. */
    @Query("UPDATE habits SET groupId = :targetGroupId WHERE groupId = :sourceGroupId")
    suspend fun reassignHabits(sourceGroupId: String, targetGroupId: String)
}
