package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.entities.WidgetHabitEntity

@Dao
interface WidgetConfigDao {
    @Query("SELECT * FROM widget_configurations")
    suspend fun getAllConfigurations(): List<WidgetConfigurationEntity>

    @Query("SELECT * FROM widget_habits")
    suspend fun getAllWidgetHabits(): List<WidgetHabitEntity>

    @Query("SELECT * FROM widget_configurations WHERE appWidgetId = :appWidgetId")
    suspend fun getConfiguration(appWidgetId: Int): WidgetConfigurationEntity?

    @Query("SELECT habitId FROM widget_habits WHERE appWidgetId = :appWidgetId")
    suspend fun getHabitIdsForWidget(appWidgetId: Int): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertConfiguration(config: WidgetConfigurationEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWidgetHabits(habits: List<WidgetHabitEntity>)

    @Query("DELETE FROM widget_habits WHERE appWidgetId = :appWidgetId")
    suspend fun deleteWidgetHabits(appWidgetId: Int)

    @Transaction
    suspend fun saveWidgetConfiguration(config: WidgetConfigurationEntity, habitIds: List<String>) {
        insertConfiguration(config)
        deleteWidgetHabits(config.appWidgetId)
        if (habitIds.isNotEmpty()) {
            insertWidgetHabits(habitIds.map { WidgetHabitEntity(appWidgetId = config.appWidgetId, habitId = it) })
        }
    }

    @Query("DELETE FROM widget_configurations WHERE appWidgetId = :appWidgetId")
    suspend fun deleteConfiguration(appWidgetId: Int)
}
