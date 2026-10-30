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
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AbstinenceJournalPersistenceTest {
    private val json = Json { encodeDefaults = true }
    private val now = Instant.parse("2026-09-08T12:00:00Z")
    private val today = LocalDate.of(2026, 9, 8)
    private fun habit() = PersistedHabit("h", "Suivi", active = true, startsOn = today.minusDays(7),
        abstinenceProfile = AbstinenceProfile.SMOKING, abstinenceStartedAt = today.minusDays(7).atStartOfDay(ZoneOffset.UTC).toInstant(),
        goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
        schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY))
    private fun checkIn(id: String = "requested") = AbstinenceLog(id, "h", now, today, ZoneOffset.UTC, AbstinenceLogKind.CHECK_IN)

    @Test fun migrationCreatesJournalWithoutLosingHabitsAndCascadesDeletion() {
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(ApplicationProvider.getApplicationContext<Context>())
                .callback(object : SupportSQLiteOpenHelper.Callback(16) {
                    override fun onConfigure(db: SupportSQLiteDatabase) = db.setForeignKeyConstraintsEnabled(true)
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL("CREATE TABLE habits (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL)")
                        db.execSQL("INSERT INTO habits VALUES ('h', 'Suivi')")
                    }
                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
                }).build())
        try {
            val db = helper.writableDatabase
            CadenceDatabase.MIGRATION_16_17.migrate(db)
            db.query("SELECT name FROM habits WHERE id = 'h'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Suivi", it.getString(0))
            }
            db.execSQL("INSERT INTO abstinence_logs VALUES ('log', 'h', 1, '2026-09-08', 'UTC', 'CHECK_IN', NULL, NULL)")
            db.execSQL("DELETE FROM habits WHERE id = 'h'")
            db.query("SELECT COUNT(*) FROM abstinence_logs").use {
                assertTrue(it.moveToFirst())
                assertEquals(0, it.getInt(0))
            }
        } finally { helper.close() }
    }

    @Test fun checkinsReplaceUrgesStayIndependentAndBackupRoundTrips() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), CadenceDatabase::class.java).build()
        try {
            val repository = CadenceRepository(db, Clock.fixed(now, ZoneOffset.UTC))
            repository.addHabit(habit(), today.minusDays(7))
            repository.saveAbstinenceLog(checkIn())
            repository.saveAbstinenceLog(checkIn("replacement").copy(note = "Un point"))
            repository.saveAbstinenceLog(checkIn("urge-one").copy(kind = AbstinenceLogKind.URGE, intensity = 4))
            repository.saveAbstinenceLog(checkIn("urge-two").copy(kind = AbstinenceLogKind.URGE, intensity = 2))
            val logs = repository.getAbstinenceLogs("h")
            assertEquals(3, logs.size)
            assertEquals("Un point", logs.single { it.kind == AbstinenceLogKind.CHECK_IN }.note)
            assertTrue(repository.getEntries("h").isEmpty())
            val backup = repository.exportBackup()
            repository.importBackup(backup)
            assertEquals(logs, repository.getAbstinenceLogs("h"))
            assertTrue(runCatching { repository.importBackup(backup.replace("\"URGE\"", "\"INVALID\"")) }.isFailure)
            assertEquals(logs, repository.getAbstinenceLogs("h"))
            val document = json.decodeFromString(BackupDocument.serializer(), backup)
            val checkIn = document.abstinenceLogs.single { it.kind == "CHECK_IN" }
            val invalidLogs = listOf(
                document.abstinenceLogs + checkIn.copy(id = "duplicate-day"),
                listOf(checkIn.copy(habitId = "missing")),
                listOf(checkIn.copy(kind = "URGE", intensity = 6)),
                listOf(checkIn.copy(localDate = today.plusDays(1).toString())),
            )
            for (invalid in invalidLogs) {
                val malformed = json.encodeToString(BackupDocument.serializer(), document.copy(abstinenceLogs = invalid))
                assertTrue(runCatching { repository.importBackup(malformed) }.isFailure)
                assertEquals(logs, repository.getAbstinenceLogs("h"))
            }
            repository.importBackup(json.encodeToString(BackupDocument.serializer(), document.copy(abstinenceLogs = emptyList())))
            assertTrue(repository.getAbstinenceLogs("h").isEmpty())
            repository.importBackup(backup)
            repository.deleteAbstinenceLog("urge-one")
            assertEquals(2, repository.getAbstinenceLogs("h").size)
            repository.updateHabit(habit().copy(abstinenceProfile = AbstinenceProfile.NONE, abstinenceStartedAt = null,
                goal = HabitGoal(1, PeriodType.DAY, GoalType.COUNT)), today)
            repository.importBackup(repository.exportBackup())
            assertEquals(2, repository.getAbstinenceLogs("h").size)
            repository.deleteHabit("h")
            assertTrue(repository.getAbstinenceLogs("h").isEmpty())
        } finally { db.close() }
    }

    @Test fun journalRejectsMissingHabitsFutureDatesAndDatesBeforeStart() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), CadenceDatabase::class.java).build()
        try {
            val repository = CadenceRepository(db, Clock.fixed(now, ZoneOffset.UTC))
            assertTrue(runCatching { repository.saveAbstinenceLog(checkIn()) }.isFailure)
            repository.addHabit(habit(), today.minusDays(7))
            assertTrue(runCatching { repository.saveAbstinenceLog(checkIn().copy(occurredAt = now.plusSeconds(1))) }.isFailure)
            assertTrue(runCatching { repository.saveAbstinenceLog(checkIn().copy(localDate = today.plusDays(1))) }.isFailure)
            assertTrue(runCatching { repository.saveAbstinenceLog(checkIn().copy(localDate = today.minusDays(8))) }.isFailure)
            repository.updateHabit(habit().copy(abstinenceProfile = AbstinenceProfile.NONE, abstinenceStartedAt = null,
                goal = HabitGoal(1, PeriodType.DAY, GoalType.COUNT)), today)
            assertTrue(runCatching { repository.saveAbstinenceLog(checkIn()) }.isFailure)
        } finally { db.close() }
    }
}
