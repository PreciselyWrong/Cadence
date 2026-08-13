package ch.nicolab.cadence.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import ch.nicolab.cadence.data.local.dao.HabitDao
import ch.nicolab.cadence.data.local.dao.HabitEntryDao
import ch.nicolab.cadence.data.local.dao.HabitPauseDao
import ch.nicolab.cadence.data.local.dao.HabitQuickValueDao
import ch.nicolab.cadence.data.local.dao.HabitReminderDao
import ch.nicolab.cadence.data.local.dao.WidgetConfigDao
import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitEntryEntity
import ch.nicolab.cadence.data.local.dao.HabitGroupDao
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitGroupEntity
import ch.nicolab.cadence.data.local.entities.HabitPauseEntity
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.entities.WidgetHabitEntity
import ch.nicolab.cadence.domain.HabitGroup

@Database(
    entities = [
        HabitEntity::class,
        HabitGoalEntity::class,
        HabitScheduleEntity::class,
        HabitEntryEntity::class,
        HabitQuickValueEntity::class,
        HabitReminderEntity::class,
        HabitPauseEntity::class,
        HabitGroupEntity::class,
        WidgetConfigurationEntity::class,
        WidgetHabitEntity::class,
    ],
    version = 9,
    exportSchema = true,
)
abstract class CadenceDatabase : RoomDatabase() {
    abstract fun habitDao(): HabitDao
    abstract fun habitEntryDao(): HabitEntryDao
    abstract fun habitQuickValueDao(): HabitQuickValueDao
    abstract fun habitPauseDao(): HabitPauseDao
    abstract fun habitGroupDao(): HabitGroupDao
    abstract fun habitReminderDao(): HabitReminderDao
    abstract fun widgetConfigDao(): WidgetConfigDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habits ADD COLUMN description TEXT")
                db.execSQL("ALTER TABLE habits ADD COLUMN iconId TEXT")
                db.execSQL("ALTER TABLE habits ADD COLUMN colorArgb INTEGER")
                db.execSQL("ALTER TABLE habits ADD COLUMN startsOn TEXT NOT NULL DEFAULT '1970-01-01'")
                db.execSQL("ALTER TABLE habits ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE habits ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE habits ADD COLUMN updatedAtEpochMs INTEGER NOT NULL DEFAULT 0")

                db.execSQL("ALTER TABLE habit_goals ADD COLUMN goalType TEXT NOT NULL DEFAULT 'QUANTITY'")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN unitId TEXT")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN unitDimension TEXT")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN unitNameFr TEXT")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN unitSymbol TEXT")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN unitScaleToCanonical INTEGER")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN frequencyTarget INTEGER")

                db.execSQL("ALTER TABLE habit_schedules ADD COLUMN scheduleMode TEXT NOT NULL DEFAULT 'SELECTED_DAYS'")

                db.execSQL("ALTER TABLE habit_entries ADD COLUMN sessionId TEXT")
                db.execSQL("ALTER TABLE habit_entries ADD COLUMN note TEXT")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN selectAll INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN opacity INTEGER NOT NULL DEFAULT 100")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN showValues INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN iconSizeDp INTEGER NOT NULL DEFAULT 32")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN progressStyle TEXT NOT NULL DEFAULT 'RING'")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN showDoneIndicator INTEGER NOT NULL DEFAULT 1")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habit_reminders ADD COLUMN conditional INTEGER NOT NULL DEFAULT 1")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN maxHabitsPerRow INTEGER NOT NULL DEFAULT 4")
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habit_schedules ADD COLUMN intervalDays INTEGER NOT NULL DEFAULT 2")
            }
        }

        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN showLabels INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN labelTextSizeSp INTEGER NOT NULL DEFAULT 11")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN labelOpacity INTEGER NOT NULL DEFAULT 100")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN valueTextSizeSp INTEGER NOT NULL DEFAULT 11")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN valueOpacity INTEGER NOT NULL DEFAULT 100")
            }
        }

        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN iconOpacity INTEGER NOT NULL DEFAULT 100")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN iconSaturation INTEGER NOT NULL DEFAULT 100")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN monochromeIcons INTEGER NOT NULL DEFAULT 0")
            }
        }

        /**
         * Introduit les groupes d'habitudes. Les groupes livrés sont créés et toutes les
         * habitudes existantes rejoignent `Journée`, le seul groupe sans horaire.
         */
        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS habit_groups (
                        id TEXT NOT NULL PRIMARY KEY,
                        name TEXT NOT NULL,
                        startMinute INTEGER,
                        endMinute INTEGER,
                        sortOrder INTEGER NOT NULL
                    )
                    """.trimIndent(),
                )
                HabitGroup.defaults().forEach { group ->
                    db.execSQL(
                        "INSERT OR IGNORE INTO habit_groups (id, name, startMinute, endMinute, sortOrder) VALUES (?, ?, ?, ?, ?)",
                        arrayOf<Any?>(group.id, group.name, group.startMinute, group.endMinute, group.sortOrder),
                    )
                }
                db.execSQL(
                    "ALTER TABLE habits ADD COLUMN groupId TEXT NOT NULL DEFAULT '${HabitGroup.ALL_DAY_ID}'",
                )
                db.execSQL("UPDATE habits SET groupId = '${HabitGroup.ALL_DAY_ID}'")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN groupMode TEXT NOT NULL DEFAULT 'ALL'")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN groupId TEXT")
            }
        }
    }
}
