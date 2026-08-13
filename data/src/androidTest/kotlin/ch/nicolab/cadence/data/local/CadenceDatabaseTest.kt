package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CadenceDatabaseTest {
    private lateinit var database: CadenceDatabase
    private lateinit var repository: CadenceRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, CadenceDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = CadenceRepository(database)
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun testInsertHabitGoalScheduleAndRead() = runBlocking {
        val habit = PersistedHabit(
            id = "habit-1",
            name = "Water intake",
            active = true,
            goal = HabitGoal(targetMinor = 2000L, period = PeriodType.DAY),
            schedule = HabitSchedule(activeDays = setOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY), firstDayOfWeek = DayOfWeek.MONDAY),
        )

        repository.addHabit(habit)

        val habits = repository.observeHabits().first()
        assertEquals(1, habits.size)
        val loaded = habits.first()
        assertEquals("habit-1", loaded.id)
        assertEquals("Water intake", loaded.name)
        assertTrue(loaded.active)
        assertEquals(2000L, loaded.goal.targetMinor)
        assertEquals(PeriodType.DAY, loaded.goal.period)
        assertEquals(setOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY), loaded.schedule.activeDays)
        assertEquals(DayOfWeek.MONDAY, loaded.schedule.firstDayOfWeek)
    }

    @Test
    fun testV2PersistenceAndEffectiveDateResolution() = runBlocking {
        val pastDate = LocalDate.of(2026, 8, 1)
        val habit = PersistedHabit(
            id = "habit-v2",
            name = "Running",
            description = "Morning jog",
            iconId = "ic_run",
            colorArgb = 0xFF123456.toInt(),
            active = true,
            startsOn = pastDate,
            archived = false,
            sortOrder = 1,
            goal = HabitGoal(
                targetMinor = 30L,
                period = PeriodType.WEEK,
                goalType = GoalType.DURATION,
                unit = MeasurementUnit.MINUTES,
                frequencyTarget = 3,
            ),
            schedule = HabitSchedule(
                mode = ScheduleMode.FLEXIBLE_PERIOD,
                activeDays = setOf(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY),
                firstDayOfWeek = DayOfWeek.MONDAY,
                intervalDays = 3,
            ),
        )

        repository.addHabit(habit, effectiveFrom = pastDate)

        val loadedPast = repository.getHabitEffectiveAt("habit-v2", pastDate)
        assertNotNull(loadedPast)
        assertEquals("Morning jog", loadedPast!!.description)
        assertEquals("ic_run", loadedPast.iconId)
        assertEquals(GoalType.DURATION, loadedPast.goal.goalType)
        assertEquals(MeasurementUnit.MINUTES, loadedPast.goal.unit)
        assertEquals(3, loadedPast.goal.frequencyTarget)
        assertEquals(ScheduleMode.FLEXIBLE_PERIOD, loadedPast.schedule.mode)
        assertEquals(3, loadedPast.schedule.intervalDays)

        // Update habit goal effective for future date
        val futureDate = LocalDate.of(2026, 8, 20)
        val updatedHabit = loadedPast.copy(
            goal = loadedPast.goal.copy(targetMinor = 60L)
        )
        repository.updateHabit(updatedHabit, effectiveFrom = futureDate)

        // On past date, old target remains 30
        val habitOnPast = repository.getHabitEffectiveAt("habit-v2", pastDate)
        assertEquals(30L, habitOnPast!!.goal.targetMinor)

        // On future date, new target is 60
        val habitOnFuture = repository.getHabitEffectiveAt("habit-v2", futureDate)
        assertEquals(60L, habitOnFuture!!.goal.targetMinor)
    }

    @Test
    fun testEntriesWithSessionAndNote() = runBlocking {
        val habit = PersistedHabit(
            id = "habit-entry-test",
            name = "Cardio",
            active = true,
            goal = HabitGoal(targetMinor = 60L, period = PeriodType.DAY),
            schedule = HabitSchedule(activeDays = setOf(DayOfWeek.MONDAY), firstDayOfWeek = DayOfWeek.MONDAY),
        )
        repository.addHabit(habit)

        val entry = HabitEntry(
            id = "entry-v2",
            habitId = "habit-entry-test",
            occurredAt = Instant.now(),
            localDate = LocalDate.of(2026, 8, 13),
            observedZoneId = ZoneId.of("Europe/Zurich"),
            valueMinor = 30L,
            sessionId = "session-123",
            note = "Felt great!",
        )
        repository.addEntry(entry)

        val entries = repository.observeEntries(
            habitId = "habit-entry-test",
            startDateInclusive = LocalDate.of(2026, 8, 1),
            endDateInclusive = LocalDate.of(2026, 8, 31),
        ).first()

        assertEquals(1, entries.size)
        assertEquals("session-123", entries[0].sessionId)
        assertEquals("Felt great!", entries[0].note)
    }

    @Test
    fun testFullBackupExportAndImportRoundTrip() = runBlocking {
        val habit = PersistedHabit(
            id = "habit-backup",
            name = "Read",
            active = true,
            goal = HabitGoal(targetMinor = 20L, period = PeriodType.DAY, goalType = GoalType.COUNT, unit = MeasurementUnit.COUNT),
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY, activeDays = DayOfWeek.entries.toSet(), firstDayOfWeek = DayOfWeek.MONDAY),
        )
        repository.addHabit(habit)

        val entry = HabitEntry(
            id = "entry-b1",
            habitId = "habit-backup",
            occurredAt = Instant.now(),
            localDate = LocalDate.of(2026, 8, 13),
            observedZoneId = ZoneId.of("UTC"),
            valueMinor = 10L,
            sessionId = "s1",
            note = "Chapter 1",
        )
        repository.addEntry(entry)
        repository.addQuickValue("habit-backup", "qv-1", "+10", 10L, 1)
        repository.addPause("habit-backup", "p-1", HabitPause(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 5)))
        repository.saveWidgetConfig(
            WidgetConfigurationEntity(appWidgetId = 101, title = "Main Widget", theme = "DARK", maxHabitsPerRow = 6),
            listOf("habit-backup"),
        )

        val exportedJson = repository.exportBackup()
        assertTrue(exportedJson.contains("habit-backup"))
        assertTrue(exportedJson.contains("Chapter 1"))

        // Import backup back
        repository.importBackup(exportedJson)

        val habits = repository.observeHabits().first()
        assertEquals(1, habits.size)
        assertEquals("habit-backup", habits[0].id)

        val entries = repository.observeEntries("habit-backup", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31)).first()
        assertEquals(1, entries.size)
        assertEquals("Chapter 1", entries[0].note)

        val widgetHabits = repository.getWidgetHabitIds(101)
        assertEquals(listOf("habit-backup"), widgetHabits)
        assertEquals(6, repository.getWidgetConfig(101)?.maxHabitsPerRow)
    }

    @Test
    fun testLegacyV1BackupImport() = runBlocking {
        val v1Json = """
        {
          "formatVersion": 1,
          "exportedAtEpochMs": 1700000000000,
          "habits": [
            {
              "id": "habit-v1",
              "name": "Legacy Habit",
              "active": true,
              "targetMinor": 100,
              "period": "DAY",
              "activeDays": ["MONDAY", "TUESDAY"],
              "firstDayOfWeek": "MONDAY"
            }
          ],
          "entries": [
            {
              "id": "entry-v1",
              "habitId": "habit-v1",
              "occurredAtEpochMs": 1700000050000,
              "localDate": "2026-08-13",
              "observedZoneId": "UTC",
              "valueMinor": 50,
              "source": "MANUAL"
            }
          ],
          "quickValues": [],
          "pauses": []
        }
        """.trimIndent()

        repository.importBackup(v1Json)

        val habits = repository.observeHabits().first()
        assertEquals(1, habits.size)
        assertEquals("habit-v1", habits[0].id)
        assertEquals("Legacy Habit", habits[0].name)

        val entries = repository.observeEntries("habit-v1", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31)).first()
        assertEquals(1, entries.size)
        assertEquals(50L, entries[0].valueMinor)
    }

    @Test
    fun testEntriesOrderedByDate() = runBlocking {
        val habit = PersistedHabit(
            id = "habit-2",
            name = "Reading",
            active = true,
            goal = HabitGoal(targetMinor = 30L, period = PeriodType.DAY),
            schedule = HabitSchedule(activeDays = setOf(DayOfWeek.MONDAY), firstDayOfWeek = DayOfWeek.MONDAY),
        )
        repository.addHabit(habit)

        val entry1 = HabitEntry(
            id = "entry-1",
            habitId = "habit-2",
            occurredAt = Instant.now(),
            localDate = LocalDate.of(2026, 8, 15),
            observedZoneId = ZoneId.of("UTC"),
            valueMinor = 10L,
        )
        val entry2 = HabitEntry(
            id = "entry-2",
            habitId = "habit-2",
            occurredAt = Instant.now(),
            localDate = LocalDate.of(2026, 8, 10),
            observedZoneId = ZoneId.of("UTC"),
            valueMinor = 15L,
        )
        val entry3 = HabitEntry(
            id = "entry-3",
            habitId = "habit-2",
            occurredAt = Instant.now(),
            localDate = LocalDate.of(2026, 8, 12),
            observedZoneId = ZoneId.of("UTC"),
            valueMinor = 20L,
        )

        repository.addEntry(entry1)
        repository.addEntry(entry2)
        repository.addEntry(entry3)

        val entries = repository.observeEntries(
            habitId = "habit-2",
            startDateInclusive = LocalDate.of(2026, 8, 1),
            endDateInclusive = LocalDate.of(2026, 8, 31),
        ).first()

        assertEquals(3, entries.size)
        assertEquals("entry-2", entries[0].id)
        assertEquals("entry-3", entries[1].id)
        assertEquals("entry-1", entries[2].id)
    }

    @Test
    fun testDeleteEntry() = runBlocking {
        val habit = PersistedHabit(
            id = "habit-3",
            name = "Exercise",
            active = true,
            goal = HabitGoal(targetMinor = 60L, period = PeriodType.DAY),
            schedule = HabitSchedule(activeDays = setOf(DayOfWeek.MONDAY), firstDayOfWeek = DayOfWeek.MONDAY),
        )
        repository.addHabit(habit)

        val entry = HabitEntry(
            id = "entry-del",
            habitId = "habit-3",
            occurredAt = Instant.now(),
            localDate = LocalDate.of(2026, 8, 13),
            observedZoneId = ZoneId.of("UTC"),
            valueMinor = 30L,
        )
        repository.addEntry(entry)

        val beforeDelete = repository.observeEntries(
            habitId = "habit-3",
            startDateInclusive = LocalDate.of(2026, 8, 1),
            endDateInclusive = LocalDate.of(2026, 8, 31),
        ).first()
        assertEquals(1, beforeDelete.size)

        repository.deleteEntry("entry-del")

        val afterDelete = repository.observeEntries(
            habitId = "habit-3",
            startDateInclusive = LocalDate.of(2026, 8, 1),
            endDateInclusive = LocalDate.of(2026, 8, 31),
        ).first()
        assertTrue(afterDelete.isEmpty())
    }

    @Test
    fun testCascadeDeleteHabit() = runBlocking {
        val habit = PersistedHabit(
            id = "habit-4",
            name = "Meditation",
            active = true,
            goal = HabitGoal(targetMinor = 15L, period = PeriodType.DAY),
            schedule = HabitSchedule(activeDays = setOf(DayOfWeek.MONDAY), firstDayOfWeek = DayOfWeek.MONDAY),
        )
        repository.addHabit(habit)

        val entry = HabitEntry(
            id = "entry-cascade",
            habitId = "habit-4",
            occurredAt = Instant.now(),
            localDate = LocalDate.of(2026, 8, 13),
            observedZoneId = ZoneId.of("UTC"),
            valueMinor = 15L,
        )
        repository.addEntry(entry)
        repository.addQuickValue("habit-4", "qv-1", "+15", 15L, 1)
        repository.addPause("habit-4", "pause-1", HabitPause(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 5)))

        repository.deleteHabit("habit-4")

        val habits = repository.observeHabits().first()
        assertTrue(habits.none { it.id == "habit-4" })

        val entries = repository.observeEntries(
            habitId = "habit-4",
            startDateInclusive = LocalDate.of(2026, 8, 1),
            endDateInclusive = LocalDate.of(2026, 8, 31),
        ).first()
        assertTrue(entries.isEmpty())

        val quickValues = repository.getQuickValues("habit-4")
        assertTrue(quickValues.isEmpty())

        val pauses = repository.getPauses("habit-4")
        assertTrue(pauses.isEmpty())
    }

    @Test
    fun pauseAndResumePreservePastPauseWithoutKeepingHabitPaused() = runBlocking {
        val habit = PersistedHabit(
            id = "pause-management",
            name = "Lecture",
            active = true,
            goal = HabitGoal(1, PeriodType.DAY),
            schedule = HabitSchedule(DayOfWeek.entries.toSet(), DayOfWeek.MONDAY),
        )
        repository.addHabit(habit)
        val start = LocalDate.of(2026, 8, 10)

        repository.pauseHabit(habit.id, start)
        repository.resumeHabit(habit.id, start.plusDays(2))

        val pauses = repository.getPauses(habit.id)
        assertEquals(1, pauses.size)
        assertTrue(pauses.single().includes(start))
        assertTrue(!pauses.single().includes(start.plusDays(2)))
    }
}
