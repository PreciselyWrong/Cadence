package ch.nicolab.cadence.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import ch.nicolab.cadence.data.local.dao.AbstinenceLogDao
import ch.nicolab.cadence.data.local.dao.AlcoholConsumptionDao
import ch.nicolab.cadence.data.local.entities.AbstinenceLogEntity
import ch.nicolab.cadence.data.local.entities.AlcoholConsumptionEntity
import ch.nicolab.cadence.data.local.dao.HabitDao
import ch.nicolab.cadence.data.local.dao.HabitEntryDao
import ch.nicolab.cadence.data.local.dao.HabitPauseDao
import ch.nicolab.cadence.data.local.dao.HabitQuickValueDao
import ch.nicolab.cadence.data.local.dao.HabitReminderDao
import ch.nicolab.cadence.data.local.dao.WidgetConfigDao
import ch.nicolab.cadence.data.local.entities.HabitEntity
import ch.nicolab.cadence.data.local.entities.HabitEntryEntity
import ch.nicolab.cadence.data.local.dao.HabitGroupDao
import ch.nicolab.cadence.data.local.dao.HabitTimerDao
import ch.nicolab.cadence.data.local.entities.HabitGoalEntity
import ch.nicolab.cadence.data.local.entities.HabitGroupEntity
import ch.nicolab.cadence.data.local.entities.HabitPauseEntity
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.entities.HabitScheduleEntity
import ch.nicolab.cadence.data.local.entities.HabitTimerEntity
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.entities.WidgetHabitEntity
import ch.nicolab.cadence.domain.HabitGroup

@Database(
    entities = [
        HabitEntity::class,
        AbstinenceLogEntity::class,
        AlcoholConsumptionEntity::class,
        HabitGoalEntity::class,
        HabitScheduleEntity::class,
        HabitEntryEntity::class,
        HabitQuickValueEntity::class,
        HabitReminderEntity::class,
        HabitPauseEntity::class,
        HabitGroupEntity::class,
        HabitTimerEntity::class,
        WidgetConfigurationEntity::class,
        WidgetHabitEntity::class,
    ],
    version = 22,
    exportSchema = true,
)
abstract class CadenceDatabase : RoomDatabase() {
    abstract fun abstinenceLogDao(): AbstinenceLogDao
    abstract fun alcoholConsumptionDao(): AlcoholConsumptionDao
    abstract fun habitDao(): HabitDao
    abstract fun habitEntryDao(): HabitEntryDao
    abstract fun habitQuickValueDao(): HabitQuickValueDao
    abstract fun habitPauseDao(): HabitPauseDao
    abstract fun habitGroupDao(): HabitGroupDao
    abstract fun habitTimerDao(): HabitTimerDao
    abstract fun habitReminderDao(): HabitReminderDao
    abstract fun widgetConfigDao(): WidgetConfigDao

    companion object {
        val MIGRATION_21_22 = object : Migration(21, 22) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE alcohol_consumptions ADD COLUMN observedAtEpochMs INTEGER")
            }
        }

        val MIGRATION_20_21 = object : Migration(20, 21) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habits ADD COLUMN alcoholFollowUpTime TEXT")
                db.execSQL("UPDATE habits SET alcoholFollowUpTime = '09:00' WHERE abstinenceProfile = 'ALCOHOL'")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS alcohol_consumptions (
                        id TEXT NOT NULL PRIMARY KEY,
                        habitId TEXT NOT NULL,
                        localDate TEXT NOT NULL,
                        observedZoneId TEXT NOT NULL,
                        standardDrinks INTEGER,
                        followUpDate TEXT,
                        followUpNotified INTEGER NOT NULL DEFAULT 0,
                        FOREIGN KEY(habitId) REFERENCES habits(id) ON UPDATE NO ACTION ON DELETE CASCADE
                    )
                    """.trimIndent(),
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_alcohol_consumptions_habitId_localDate ON alcohol_consumptions (habitId, localDate)")
                db.execSQL(
                    """
                    INSERT INTO alcohol_consumptions (
                        id, habitId, localDate, observedZoneId, standardDrinks, followUpDate, followUpNotified
                    )
                    SELECT entry.id, entry.habitId, entry.localDate, entry.observedZoneId, NULL, NULL, 0
                    FROM habit_entries AS entry
                    INNER JOIN habits AS habit ON habit.id = entry.habitId
                    WHERE habit.abstinenceProfile = 'ALCOHOL'
                      AND entry.id = (
                          SELECT candidate.id
                          FROM habit_entries AS candidate
                          WHERE candidate.habitId = entry.habitId AND candidate.localDate = entry.localDate
                          ORDER BY candidate.occurredAtEpochMs ASC, candidate.id ASC
                          LIMIT 1
                      )
                    """.trimIndent(),
                )
                db.execSQL("DELETE FROM habit_entries WHERE habitId IN (SELECT id FROM habits WHERE abstinenceProfile = 'ALCOHOL')")
            }
        }

        val MIGRATION_19_20 = object : Migration(19, 20) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habits ADD COLUMN abstinenceSpendingMinor INTEGER")
                db.execSQL("ALTER TABLE habits ADD COLUMN abstinenceSpendingPeriod TEXT")
                db.execSQL("UPDATE habits SET abstinenceSpendingMinor = abstinenceSavingsDailyMinor, abstinenceSpendingPeriod = 'DAY' WHERE abstinenceSavingsDailyMinor IS NOT NULL")
            }
        }

        val MIGRATION_18_19 = object : Migration(18, 19) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habits ADD COLUMN abstinenceSavingsDailyMinor INTEGER")
                db.execSQL("ALTER TABLE habits ADD COLUMN abstinenceSavingsCurrency TEXT")
            }
        }

        val MIGRATION_17_18 = object : Migration(17, 18) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habits ADD COLUMN abstinenceStartedAtEpochMs INTEGER")
            }
        }

        val MIGRATION_16_17 = object : Migration(16, 17) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS abstinence_logs (
                        id TEXT NOT NULL PRIMARY KEY,
                        habitId TEXT NOT NULL,
                        occurredAtEpochMs INTEGER NOT NULL,
                        localDate TEXT NOT NULL,
                        observedZoneId TEXT NOT NULL,
                        kind TEXT NOT NULL,
                        intensity INTEGER,
                        note TEXT,
                        FOREIGN KEY(habitId) REFERENCES habits(id) ON UPDATE NO ACTION ON DELETE CASCADE
                    )
                """.trimIndent())
                db.execSQL("CREATE INDEX IF NOT EXISTS index_abstinence_logs_habitId_localDate ON abstinence_logs (habitId, localDate)")
            }
        }

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

        /**
         * Introduit le minimum d'un objectif. Les objectifs existants restent sans minimum
         * distinct : leur cible seule continue de valider la période.
         */
        val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN minimumMinor INTEGER")
            }
        }

        /**
         * Motive les pauses. `SKIPPED_TODAY`, seule valeur écrite jusqu'ici, devient un
         * saut de repos; les autres pauses restent des pauses manuelles sans motif.
         */
        val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habit_pauses ADD COLUMN reasonLabel TEXT")
                db.execSQL("UPDATE habit_pauses SET reason = 'REST' WHERE reason = 'SKIPPED_TODAY'")
                db.execSQL("UPDATE habit_pauses SET reason = 'MANUAL' WHERE reason IS NULL OR reason NOT IN ('REST', 'ILLNESS', 'TRAVEL', 'CUSTOM')")
            }
        }

        /**
         * Introduit le chronomètre. Le mode reste désactivé sur les habitudes existantes :
         * il se propose, il ne s'impose pas.
         */
        val MIGRATION_11_12 = object : Migration(11, 12) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habits ADD COLUMN timerEnabled INTEGER NOT NULL DEFAULT 0")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS habit_timers (
                        habitId TEXT NOT NULL PRIMARY KEY,
                        accumulatedSeconds INTEGER NOT NULL,
                        runningSinceEpochMs INTEGER,
                        FOREIGN KEY(habitId) REFERENCES habits(id) ON UPDATE NO ACTION ON DELETE CASCADE
                    )
                    """.trimIndent(),
                )
            }
        }

        /**
         * Introduit les habitudes à limiter. Les objectifs existants gardent leur sens :
         * une cible à atteindre, jamais un plafond.
         */
        val MIGRATION_12_13 = object : Migration(12, 13) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN direction TEXT NOT NULL DEFAULT 'AT_LEAST'")
            }
        }

        /** Introduit les objectifs progressifs. Les cibles existantes restent fixes. */
        val MIGRATION_13_14 = object : Migration(13, 14) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN progressionStep INTEGER")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN progressionCadence TEXT")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN progressionCapMinor INTEGER")
                db.execSQL("ALTER TABLE habit_goals ADD COLUMN progressionStartsOn TEXT")
            }
        }

        /** Existing habits keep ordinary tracking until abstinence is explicitly selected. */
        val MIGRATION_15_16 = object : Migration(15, 16) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE habits ADD COLUMN abstinenceProfile TEXT NOT NULL DEFAULT 'NONE'")
                db.execSQL("ALTER TABLE habits ADD COLUMN abstinenceStartedOn TEXT")
            }
        }

        /** Existing widgets keep their flexible slot distribution. */
        val MIGRATION_14_15 = object : Migration(14, 15) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN slotMode TEXT NOT NULL DEFAULT 'FLEXIBLE'")
                db.execSQL("ALTER TABLE widget_configurations ADD COLUMN slotAlignment TEXT NOT NULL DEFAULT 'CENTER'")
            }
        }
    }
}
