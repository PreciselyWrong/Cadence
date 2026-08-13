package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.PeriodType
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
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
}
