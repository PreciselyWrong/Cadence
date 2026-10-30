package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.HealthConnectImportEntity
import ch.nicolab.cadence.data.local.entities.HealthConnectRuleEntity

@Dao
interface HealthConnectDao {
    @Query("SELECT * FROM health_connect_rules ORDER BY habitId")
    suspend fun getRules(): List<HealthConnectRuleEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveRule(rule: HealthConnectRuleEntity)

    @Query("DELETE FROM health_connect_rules WHERE habitId = :habitId")
    suspend fun deleteRule(habitId: String)

    @Query("SELECT * FROM health_connect_imports")
    suspend fun getImports(): List<HealthConnectImportEntity>

    @Query("SELECT * FROM health_connect_imports WHERE recordId = :recordId AND habitId = :habitId")
    suspend fun getImport(recordId: String, habitId: String): HealthConnectImportEntity?

    @Query("SELECT * FROM health_connect_imports WHERE entryId = :entryId")
    suspend fun getImportByEntryId(entryId: String): HealthConnectImportEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveImport(imported: HealthConnectImportEntity)

    @Query("UPDATE health_connect_imports SET state = :state WHERE entryId = :entryId")
    suspend fun updateImportState(entryId: String, state: String)
}
