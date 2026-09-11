package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AlcoholConsumptionPersistenceTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        CadenceDatabase::class.java,
    )

    @Test fun migrationAddsOptionalObservedInstant() {
        helper.createDatabase("alcohol-observed-at", 21).close()

        helper.runMigrationsAndValidate(
            "alcohol-observed-at",
            22,
            true,
            CadenceDatabase.MIGRATION_21_22,
        ).use { db ->
            db.query("PRAGMA table_info(alcohol_consumptions)").use { cursor ->
                val nameIndex = cursor.getColumnIndex("name")
                var found = false
                while (cursor.moveToNext()) found = found || cursor.getString(nameIndex) == "observedAtEpochMs"
                assertTrue(found)
            }
        }
    }

    @Test fun migrationGroupsLegacyAlcoholEntriesAndKeepsOrdinaryEntries() {
        helper.createDatabase("alcohol-consumption", 20).apply {
            execSQL("INSERT INTO habits (id, name, active, createdAtEpochMs, abstinenceProfile) VALUES ('alcohol', 'Alcool', 1, 1, 'ALCOHOL')")
            execSQL("INSERT INTO habits (id, name, active, createdAtEpochMs, abstinenceProfile) VALUES ('ordinary', 'Lecture', 1, 2, 'NONE')")
            execSQL("INSERT INTO habit_entries (id, habitId, occurredAtEpochMs, localDate, observedZoneId, valueMinor, source) VALUES ('late', 'alcohol', 20, '2026-09-10', 'Europe/Zurich', 1, 'MANUAL')")
            execSQL("INSERT INTO habit_entries (id, habitId, occurredAtEpochMs, localDate, observedZoneId, valueMinor, source) VALUES ('first', 'alcohol', 10, '2026-09-10', 'UTC', 1, 'MANUAL')")
            execSQL("INSERT INTO habit_entries (id, habitId, occurredAtEpochMs, localDate, observedZoneId, valueMinor, source) VALUES ('ordinary-entry', 'ordinary', 10, '2026-09-10', 'UTC', 1, 'MANUAL')")
            close()
        }

        helper.runMigrationsAndValidate(
            "alcohol-consumption",
            21,
            true,
            CadenceDatabase.MIGRATION_20_21,
        ).use { db ->
            db.query("SELECT id, observedZoneId, standardDrinks, followUpDate, followUpNotified FROM alcohol_consumptions").use {
                assertTrue(it.moveToFirst())
                assertEquals("first", it.getString(0))
                assertEquals("UTC", it.getString(1))
                assertTrue(it.isNull(2))
                assertTrue(it.isNull(3))
                assertEquals(0, it.getInt(4))
            }
            db.query("SELECT COUNT(*) FROM habit_entries WHERE habitId = 'alcohol'").use {
                assertTrue(it.moveToFirst())
                assertEquals(0, it.getInt(0))
            }
            db.query("SELECT COUNT(*) FROM habit_entries WHERE habitId = 'ordinary'").use {
                assertTrue(it.moveToFirst())
                assertEquals(1, it.getInt(0))
            }
            db.query("SELECT alcoholFollowUpTime FROM habits WHERE id = 'alcohol'").use {
                assertTrue(it.moveToFirst())
                assertEquals("09:00", it.getString(0))
            }
        }
    }

    @Test fun alcoholConsumptionRoundTripsAndUpsertsByDay() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, CadenceDatabase::class.java).build()
        try {
            val repository = CadenceRepository(database)
            val today = LocalDate.now()
            val start = today.minusDays(7)
            val habit = PersistedHabit(
                id = "alcohol",
                name = "Alcool",
                active = true,
                startsOn = start,
                abstinenceProfile = AbstinenceProfile.ALCOHOL,
                abstinenceStartedAt = start.atStartOfDay(ZoneOffset.UTC).toInstant(),
                goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
                schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
            )
            repository.addHabit(habit, start)
            val observedAt = today.atTime(10, 15, 30).toInstant(ZoneOffset.UTC)
            repository.saveAlcoholConsumption(
                AlcoholConsumption("original", habit.id, today, ZoneOffset.UTC, null, today.plusDays(1), false, observedAt),
            )
            repository.saveAlcoholConsumption(
                AlcoholConsumption("replacement", habit.id, today, ZoneOffset.UTC, 3, today.plusDays(1), true),
            )
            repository.saveAlcoholConsumption(
                AlcoholConsumption("pending", habit.id, today.minusDays(1), ZoneOffset.UTC, null, today, false),
            )
            val exported = repository.exportBackup()
            assertTrue(exported.contains("\"formatVersion\":3"))
            repository.importBackup(exported)

            val restored = repository.getAlcoholConsumptions(habit.id)
            assertEquals(2, restored.size)
            val known = restored.first { it.localDate == today }
            assertEquals("original", known.id)
            assertEquals(3, known.standardDrinks)
            assertEquals(today.plusDays(1), known.followUpDate)
            assertTrue(known.followUpNotified)
            assertEquals(observedAt, known.observedAt)
            val pending = restored.first { it.localDate == today.minusDays(1) }
            assertNull(pending.standardDrinks)
            assertEquals(today, pending.followUpDate)
            assertTrue(pending.followUpNotified)
            assertEquals("09:00", repository.getHabitEffectiveAt(habit.id, today)?.alcoholFollowUpTime)
            assertNull(repository.getAlcoholConsumptions("missing").singleOrNull())
        } finally {
            database.close()
        }
    }

    @Test fun v2BackupGroupsAlcoholEntriesWithoutSchedulingFollowUps() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, CadenceDatabase::class.java).build()
        try {
            val repository = CadenceRepository(database)
            val day = LocalDate.now().minusDays(1)
            val backup = BackupDocument(
                formatVersion = 2,
                exportedAtEpochMs = 1,
                habits = listOf(
                    BackupHabitV2(
                        id = "alcohol",
                        name = "Alcool",
                        active = true,
                        startsOn = day.minusDays(2).toString(),
                        archived = false,
                        sortOrder = 0,
                        createdAtEpochMs = 1,
                        updatedAtEpochMs = 1,
                        abstinenceProfile = AbstinenceProfile.ALCOHOL.name,
                        abstinenceStartedOn = day.minusDays(2).toString(),
                        goals = listOf(
                            BackupGoalV2(
                                id = "goal",
                                habitId = "alcohol",
                                targetMinor = 0,
                                period = PeriodType.DAY.name,
                                goalType = GoalType.COUNT.name,
                                direction = GoalDirection.AT_MOST.name,
                                effectiveFrom = day.minusDays(2).toString(),
                            ),
                        ),
                        schedules = listOf(
                            BackupScheduleV2(
                                id = "schedule",
                                habitId = "alcohol",
                                scheduleMode = ScheduleMode.EVERY_DAY.name,
                                activeDays = emptyList(),
                                firstDayOfWeek = "MONDAY",
                                effectiveFrom = day.minusDays(2).toString(),
                            ),
                        ),
                    ),
                ),
                entries = listOf(
                    BackupEntryV2("late", "alcohol", 20, day.toString(), "Europe/Zurich", 1, "APP"),
                    BackupEntryV2("first", "alcohol", 10, day.toString(), "UTC", 1, "APP"),
                ),
            )

            repository.importBackup(Json.encodeToString(BackupDocument.serializer(), backup))

            val consumption = repository.getAlcoholConsumptions("alcohol").single()
            assertEquals("first", consumption.id)
            assertEquals("UTC", consumption.observedZoneId.id)
            assertNull(consumption.standardDrinks)
            assertNull(consumption.followUpDate)
            assertTrue(repository.getEntries("alcohol").isEmpty())
        } finally {
            database.close()
        }
    }
}
