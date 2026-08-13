package ch.nicolab.cadence.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import ch.nicolab.cadence.data.local.dao.HabitDao
import ch.nicolab.cadence.data.local.dao.HabitEntryDao
import ch.nicolab.cadence.data.local.dao.HabitPauseDao
import ch.nicolab.cadence.data.local.dao.HabitQuickValueDao
import ch.nicolab.cadence.data.local.dao.HabitReminderDao
import ch.nicolab.cadence.data.local.dao.WidgetConfigDao
import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitEntryEntity
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitPauseEntity
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.entities.WidgetHabitEntity

@Database(
    entities = [
        HabitEntity::class,
        HabitGoalEntity::class,
        HabitScheduleEntity::class,
        HabitEntryEntity::class,
        HabitQuickValueEntity::class,
        HabitReminderEntity::class,
        HabitPauseEntity::class,
        WidgetConfigurationEntity::class,
        WidgetHabitEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class CadenceDatabase : RoomDatabase() {
    abstract fun habitDao(): HabitDao
    abstract fun habitEntryDao(): HabitEntryDao
    abstract fun habitQuickValueDao(): HabitQuickValueDao
    abstract fun habitPauseDao(): HabitPauseDao
    abstract fun habitReminderDao(): HabitReminderDao
    abstract fun widgetConfigDao(): WidgetConfigDao
}
