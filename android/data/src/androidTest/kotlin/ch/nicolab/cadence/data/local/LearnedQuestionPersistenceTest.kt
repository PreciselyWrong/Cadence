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
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEntrySource
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.LearnedAnswer
import ch.nicolab.cadence.domain.LearnedQuestionRecord
import ch.nicolab.cadence.domain.LearnedQuestionOutcome
import ch.nicolab.cadence.domain.LearnedQuestionSettings
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import java.time.Clock
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LearnedQuestionPersistenceTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        CadenceDatabase::class.java,
    )

    @Test fun migrationCreatesLearnedQuestionTables() {
        helper.createDatabase("learned-questions", 23).apply {
            execSQL("INSERT INTO habits (id, name, active, createdAtEpochMs) VALUES ('h', 'Lecture', 1, 1)")
            close()
        }

        helper.runMigrationsAndValidate(
            "learned-questions",
            24,
            true,
            CadenceDatabase.MIGRATION_23_24,
        ).use { db ->
            db.execSQL("INSERT INTO learned_question_settings (habitId, enabled, askAt, thresholdPercent, mutedWeekdays) VALUES ('h', 1, '09:00', 50, '')")
            db.execSQL("INSERT INTO learned_question_records (habitId, localDate, outcome, valueMinor, recordedAtEpochMs) VALUES ('h', '2026-10-29', 'NO', NULL, 1)")
            db.query("SELECT COUNT(*) FROM learned_question_settings WHERE habitId = 'h'").use {
                assertTrue(it.moveToFirst())
                assertEquals(1, it.getInt(0))
            }
            db.query("SELECT COUNT(*) FROM learned_question_records WHERE habitId = 'h'").use {
                assertTrue(it.moveToFirst())
                assertEquals(1, it.getInt(0))
            }
        }
    }

    @Test fun pendingQuestionsOfferTrackerAndAlcoholButNotDisabledGoal() = withFixture { f ->
        val pending = f.learned.pendingQuestions()

        assertEquals(setOf(TRACKER, ALCOHOL), pending.map { it.habitId }.toSet())
        pending.forEach { question ->
            assertEquals(DayOfWeek.THURSDAY, question.weekday)
            assertEquals(LocalDate.of(2026, 10, 29), question.date)
            assertEquals(9, question.evidence.hits)
            assertEquals(12, question.evidence.observed)
        }
    }

    @Test fun entryYesterdayRemovesTrackerQuestion() = withFixture { f ->
        f.cadence.addEntry(entry(TRACKER, YESTERDAY, valueMinor = 2))

        assertFalse(f.learned.pendingQuestions().any { it.habitId == TRACKER })
    }

    @Test fun alcoholYesWritesUnspecifiedConsumptionAndClosesQuestion() = withFixture { f ->
        val question = f.question(ALCOHOL)

        f.learned.answer(question, LearnedAnswer.Yes)

        val consumption = f.consumptionOn(YESTERDAY)
        assertNull(consumption.standardDrinks)
        assertNull(consumption.followUpDate)
        assertTrue(consumption.followUpNotified)
        assertFalse(f.learned.pendingQuestions().any { it.habitId == ALCOHOL })
    }

    @Test fun alcoholYesKeepsConsumptionLoggedMeanwhile() = withFixture { f ->
        val question = f.question(ALCOHOL)
        val logged = consumption(YESTERDAY).copy(standardDrinks = 3, followUpDate = YESTERDAY.plusDays(1))
        f.cadence.saveAlcoholConsumption(logged)

        f.learned.answer(question, LearnedAnswer.Yes)

        val kept = f.consumptionOn(YESTERDAY)
        assertEquals(3, kept.standardDrinks)
        assertEquals(YESTERDAY.plusDays(1), kept.followUpDate)
        assertEquals(LearnedQuestionOutcome.YES, f.recordOf(ALCOHOL)?.outcome)
    }

    @Test fun alcoholAmountStoresStandardDrinks() = withFixture { f ->
        f.learned.answer(f.question(ALCOHOL), LearnedAnswer.Amount(2))

        assertEquals(2, f.consumptionOn(YESTERDAY).standardDrinks)
    }

    @Test fun alcoholNoRecordsAnswerWithoutConsumption() = withFixture { f ->
        f.learned.answer(f.question(ALCOHOL), LearnedAnswer.No)

        assertTrue(f.cadence.getAlcoholConsumptions(ALCOHOL).none { it.localDate == YESTERDAY })
        assertEquals(LearnedQuestionOutcome.NO, f.recordOf(ALCOHOL)?.outcome)
        assertFalse(f.learned.pendingQuestions().any { it.habitId == ALCOHOL })
    }

    @Test fun trackerAmountWritesEntryInObservedZone() = withFixture { f ->
        f.learned.answer(f.question(TRACKER), LearnedAnswer.Amount(3))

        val entry = f.cadence.getEntries(TRACKER, YESTERDAY, YESTERDAY).single()
        assertEquals(YESTERDAY, entry.localDate)
        assertEquals(ZoneId.of("Europe/Zurich"), entry.observedZoneId)
        assertEquals(3L, entry.valueMinor)
        assertEquals(HabitEntrySource.LEARNED_QUESTION, entry.source)
    }

    @Test fun answeringTwiceWritesOneEntry() = withFixture { f ->
        val question = f.question(TRACKER)

        f.learned.answer(question, LearnedAnswer.Amount(3))
        f.learned.answer(question, LearnedAnswer.Amount(5))

        val entries = f.cadence.getEntries(TRACKER, YESTERDAY, YESTERDAY)
        assertEquals(1, entries.size)
        assertEquals(3L, entries.single().valueMinor)
    }

    @Test fun dismissRemovesQuestion() = withFixture { f ->
        f.learned.dismiss(f.question(TRACKER))

        assertEquals(LearnedQuestionOutcome.DISMISSED, f.recordOf(TRACKER)?.outcome)
        assertFalse(f.learned.pendingQuestions().any { it.habitId == TRACKER })
    }

    @Test fun muteWeekdayRemovesQuestionAndPersists() = withFixture { f ->
        f.learned.muteWeekday(TRACKER, DayOfWeek.THURSDAY)

        assertFalse(f.learned.pendingQuestions().any { it.habitId == TRACKER })
        assertEquals(setOf(DayOfWeek.THURSDAY), f.learned.settings(TRACKER).mutedWeekdays)
    }

    @Test fun settingsDefaultsAndUpdateRoundTrip() = withFixture { f ->
        assertTrue(f.learned.settings(TRACKER).enabled)
        assertFalse(f.learned.settings(GOAL).enabled)
        assertEquals(LocalTime.of(9, 0), f.learned.settings(TRACKER).askAt)
        assertEquals(50, f.learned.settings(TRACKER).thresholdPercent)

        val updated = LearnedQuestionSettings(
            habitId = TRACKER,
            enabled = true,
            askAt = LocalTime.of(7, 30),
            thresholdPercent = 75,
            mutedWeekdays = setOf(DayOfWeek.FRIDAY, DayOfWeek.MONDAY),
        )
        f.learned.updateSettings(updated)

        assertEquals(updated, f.learned.settings(TRACKER))
    }

    @Test fun backupRoundTripKeepsSettingsAndRecords() = withFixture { f ->
        f.learned.updateSettings(LearnedQuestionSettings(TRACKER, enabled = true, askAt = LocalTime.of(7, 30)))
        f.learned.answer(f.question(TRACKER), LearnedAnswer.No)
        val exported = f.cadence.exportBackup()

        val restored = freshDatabase()
        try {
            CadenceRepository(restored, clock).importBackup(exported)
            val settings = LearnedQuestionRepository(restored, CadenceRepository(restored, clock), clock).settings(TRACKER)
            assertEquals(LocalTime.of(7, 30), settings.askAt)
            val records = restored.learnedQuestionDao().getRecords(TRACKER)
            assertEquals(1, records.size)
            assertEquals(LearnedQuestionOutcome.NO.name, records.single().outcome)
        } finally {
            restored.close()
        }
    }

    @Test fun backupWithoutLearnedKeysStillImports() = withFixture { f ->
        val exported = Json.parseToJsonElement(f.cadence.exportBackup()).jsonObject
        val legacy = JsonObject(exported.filterKeys { it !in LEARNED_BACKUP_KEYS }).toString()

        val restored = freshDatabase()
        try {
            CadenceRepository(restored, clock).importBackup(legacy)
            assertTrue(restored.learnedQuestionDao().getAllSettings().isEmpty())
            assertTrue(restored.learnedQuestionDao().getAllRecords().isEmpty())
            assertEquals(1, restored.habitDao().getAllHabitsWithGoalAndSchedule().count { it.habit.id == TRACKER })
        } finally {
            restored.close()
        }
    }

    private class Fixture(
        val database: CadenceDatabase,
        val cadence: CadenceRepository,
        val learned: LearnedQuestionRepository,
    ) {
        suspend fun question(habitId: String) = learned.pendingQuestions().single { it.habitId == habitId }

        suspend fun consumptionOn(date: LocalDate) =
            cadence.getAlcoholConsumptions(ALCOHOL).single { it.localDate == date }

        suspend fun recordOf(habitId: String) =
            database.learnedQuestionDao().getRecord(habitId, YESTERDAY.toString())
                ?.let { record ->
                    LearnedQuestionRecord(
                        habitId = record.habitId,
                        date = LocalDate.parse(record.localDate),
                        outcome = LearnedQuestionOutcome.valueOf(record.outcome),
                        valueMinor = record.valueMinor,
                        recordedAt = Instant.ofEpochMilli(record.recordedAtEpochMs),
                    )
                }
    }

    private fun withFixture(block: suspend (Fixture) -> Unit) = runBlocking {
        val database = freshDatabase()
        try {
            val cadence = CadenceRepository(database, clock)
            seed(cadence)
            block(Fixture(database, cadence, LearnedQuestionRepository(database, cadence, clock)))
        } finally {
            database.close()
        }
    }

    private fun freshDatabase(): CadenceDatabase {
        val context = ApplicationProvider.getApplicationContext<Context>()
        return Room.inMemoryDatabaseBuilder(context, CadenceDatabase::class.java).build()
    }

    private suspend fun seed(cadence: CadenceRepository) {
        val start = LocalDate.of(2026, 1, 1)
        val schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY)
        cadence.addHabit(
            PersistedHabit(
                id = TRACKER,
                name = "Lecture",
                active = true,
                startsOn = start,
                goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, MeasurementUnit.COUNT, direction = GoalDirection.TRACK_ONLY),
                schedule = schedule,
            ),
            start,
        )
        cadence.addHabit(
            PersistedHabit(
                id = ALCOHOL,
                name = "Alcool",
                active = true,
                startsOn = start,
                abstinenceProfile = AbstinenceProfile.ALCOHOL,
                abstinenceStartedAt = start.atStartOfDay(ZoneOffset.UTC).toInstant(),
                goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST),
                schedule = schedule,
            ),
            start,
        )
        cadence.addHabit(
            PersistedHabit(
                id = GOAL,
                name = "Objectif",
                active = true,
                startsOn = start,
                goal = HabitGoal(1, PeriodType.DAY, GoalType.BINARY),
                schedule = schedule,
            ),
            start,
        )

        val anchor = LocalDate.of(2026, 7, 27)
        cadence.addEntry(entry(TRACKER, anchor, valueMinor = 1))
        cadence.saveAlcoholConsumption(consumption(anchor))
        // Douze jeudis observés ; le jeudi 3 septembre, le 17 septembre et le 8 octobre restent vides.
        THURSDAYS.filterNot { it in MISSED_THURSDAYS }.forEach { day ->
            cadence.addEntry(entry(TRACKER, day, valueMinor = 1))
            cadence.saveAlcoholConsumption(consumption(day))
        }
    }

    private fun entry(habitId: String, date: LocalDate, valueMinor: Long) = HabitEntry(
        id = "$habitId-$date",
        habitId = habitId,
        occurredAt = date.atTime(12, 0).atZone(ZoneId.of("Europe/Zurich")).toInstant(),
        localDate = date,
        observedZoneId = ZoneId.of("Europe/Zurich"),
        valueMinor = valueMinor,
    )

    private fun consumption(date: LocalDate) = AlcoholConsumption(
        id = "$ALCOHOL-$date",
        habitId = ALCOHOL,
        localDate = date,
        observedZoneId = ZoneId.of("Europe/Zurich"),
    )

    private companion object {
        const val TRACKER = "tracker"
        const val ALCOHOL = "alcohol"
        const val GOAL = "goal"
        val YESTERDAY: LocalDate = LocalDate.of(2026, 10, 29)
        val clock: Clock = Clock.fixed(Instant.parse("2026-10-30T08:00:00Z"), ZoneId.of("Europe/Zurich"))
        val THURSDAYS: List<LocalDate> = generateSequence(LocalDate.of(2026, 8, 6)) { it.plusWeeks(1) }
            .takeWhile { it <= LocalDate.of(2026, 10, 22) }
            .toList()
        val MISSED_THURSDAYS: Set<LocalDate> = setOf(
            LocalDate.of(2026, 9, 3),
            LocalDate.of(2026, 9, 17),
            LocalDate.of(2026, 10, 8),
        )
        val LEARNED_BACKUP_KEYS = setOf("learnedQuestionSettings", "learnedQuestionRecords")
    }
}
