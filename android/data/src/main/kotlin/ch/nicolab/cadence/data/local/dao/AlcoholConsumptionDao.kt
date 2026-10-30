package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.AlcoholConsumptionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AlcoholConsumptionDao {
    @Query("SELECT COUNT(*) + COALESCE(SUM(COALESCE(standardDrinks, 0) + followUpNotified), 0) FROM alcohol_consumptions")
    fun observeRevision(): Flow<Long>

    @Query("SELECT * FROM alcohol_consumptions WHERE habitId = :habitId ORDER BY localDate DESC, id")
    suspend fun getConsumptions(habitId: String): List<AlcoholConsumptionEntity>

    @Query("SELECT * FROM alcohol_consumptions ORDER BY localDate, id")
    suspend fun getAllConsumptions(): List<AlcoholConsumptionEntity>

    @Query("SELECT * FROM alcohol_consumptions WHERE id = :id")
    suspend fun getConsumption(id: String): AlcoholConsumptionEntity?

    @Query("SELECT * FROM alcohol_consumptions WHERE habitId = :habitId AND localDate = :localDate")
    suspend fun getConsumptionForDay(habitId: String, localDate: String): AlcoholConsumptionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(consumption: AlcoholConsumptionEntity)

    @Query("DELETE FROM alcohol_consumptions WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE alcohol_consumptions SET followUpNotified = 1 WHERE id = :id")
    suspend fun markFollowUpNotified(id: String)
}
