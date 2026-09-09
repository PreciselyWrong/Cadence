package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.*
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneOffset
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AbstinencePersistenceTest {
    @Test fun migrationAddsOptionalSavingsWithoutInventingAValue() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .callback(object : SupportSQLiteOpenHelper.Callback(18) {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL("CREATE TABLE habits (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL)")
                        db.execSQL("INSERT INTO habits VALUES ('existing', 'Lecture')")
                    }
                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
                }).build())
        try {
            val db = helper.writableDatabase
            CadenceDatabase.MIGRATION_18_19.migrate(db)
            db.query("SELECT abstinenceSavingsDailyMinor, abstinenceSavingsCurrency FROM habits").use {
                assertTrue(it.moveToFirst())
                assertTrue(it.isNull(0))
                assertTrue(it.isNull(1))
            }
        } finally { helper.close() }
    }

    @Test fun behavioralProfilesSurviveBackup() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), CadenceDatabase::class.java).build()
        try {
            val repository = CadenceRepository(db)
            val start = LocalDate.of(2026, 9, 1)
            val profiles = listOf("GAMBLING", "SOCIAL_MEDIA", "BEDTIME_SCREENS", "IMPULSE_SHOPPING", "PORNOGRAPHY")
                .map(AbstinenceProfile::valueOf)
            profiles.forEach { profile ->
                repository.addHabit(PersistedHabit(profile.name, "Suivi", active = true, startsOn = start,
                    abstinenceProfile = profile, abstinenceStartedAt = start.atStartOfDay(ZoneOffset.UTC).toInstant(),
                    goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
                    schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY)), start)
            }
            repository.importBackup(repository.exportBackup())
            profiles.forEach { profile ->
                val restored = repository.getHabitEffectiveAt(profile.name, start)!!
                assertEquals(profile, restored.abstinenceProfile)
                assertEquals(start, restored.abstinenceStartedOn(ZoneOffset.UTC))
            }
        } finally { db.close() }
    }
    @Test fun convertingRunningTimerToAbstinenceClearsTimer() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, CadenceDatabase::class.java).build()
        try {
            val repository = CadenceRepository(db)
            val start = LocalDate.of(2026, 9, 1)
            val habit = PersistedHabit("timed", "Suivi", active = true, startsOn = start,
                timerEnabled = true,
                goal = HabitGoal(60, PeriodType.DAY, GoalType.DURATION, MeasurementUnit.SECONDS),
                schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY))
            repository.addHabit(habit, start)
            val timer = HabitTimer.started(habit.id, Instant.parse("2026-09-01T10:00:00Z"))
            repository.saveTimer(timer)
            repository.updateHabit(habit.copy(name = "Suivi renommé"), start)
            assertEquals(timer, repository.getTimer(habit.id))
            repository.updateHabit(habit.copy(
                timerEnabled = false,
                abstinenceProfile = AbstinenceProfile.ALCOHOL,
                abstinenceStartedAt = start.atStartOfDay(ZoneOffset.UTC).toInstant(),
                goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
            ), start)
            assertNull(repository.getTimer(habit.id))
        } finally { db.close() }
    }

    @Test fun migrationPreservesExistingHabitsWithoutInventingAbstinence() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .callback(object : SupportSQLiteOpenHelper.Callback(15) {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL("CREATE TABLE habits (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL)")
                        db.execSQL("INSERT INTO habits VALUES ('existing', 'Lecture')")
                    }
                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
                }).build())
        try {
            val db = helper.writableDatabase
            CadenceDatabase.MIGRATION_15_16.migrate(db)
            db.query("SELECT id, name, abstinenceProfile, abstinenceStartedOn FROM habits").use {
                assertTrue(it.moveToFirst())
                assertEquals("existing", it.getString(0))
                assertEquals("Lecture", it.getString(1))
                assertEquals("NONE", it.getString(2))
                assertTrue(it.isNull(3))
            }
        } finally { helper.close() }
    }

    @Test fun profileAndStartSurviveUpdateAndBackup() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, CadenceDatabase::class.java).build()
        try {
            val repository = CadenceRepository(db)
            val start = LocalDate.of(2026, 9, 1)
            val startAt = Instant.parse("2026-09-01T08:42:00Z")
            val habit = PersistedHabit("abstinence", "Alcool", active = true, startsOn = start,
                abstinenceProfile = AbstinenceProfile.ALCOHOL, abstinenceStartedAt = startAt,
                abstinenceSavingsDailyMinor = 1_250L, abstinenceSavingsCurrency = "CHF",
                goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
                schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY))
            repository.addHabit(habit, start)
            repository.updateHabit(habit.copy(name = "Sans alcool"), start.plusDays(1))
            val backup = repository.exportBackup()
            repository.importBackup(backup)
            val restored = repository.getHabitEffectiveAt(habit.id, start.plusDays(2))!!
            assertEquals(AbstinenceProfile.ALCOHOL, restored.abstinenceProfile)
            assertEquals(start, restored.abstinenceStartedOn(ZoneOffset.UTC))
            assertEquals(startAt, restored.abstinenceStartedAt)
            assertEquals(1_250L, restored.abstinenceSavingsDailyMinor)
            assertEquals("CHF", restored.abstinenceSavingsCurrency)
            assertTrue(restored.goal.isAbstinence)
            assertEquals("Sans alcool", restored.name)
            val invalidProfile = backup.replace("\"ALCOHOL\"", "\"UNKNOWN\"")
            assertTrue(runCatching { repository.importBackup(invalidProfile) }.isFailure)
            assertEquals(restored, repository.getHabitEffectiveAt(habit.id, start.plusDays(2)))
        } finally { db.close() }
    }
}

