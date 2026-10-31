package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import ch.nicolab.cadence.data.sync.ApplyResult
import ch.nicolab.cadence.data.sync.HabitSyncTriggers
import ch.nicolab.cadence.data.sync.RoomHabitSyncStorage
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HabitSyncPersistenceTest {
    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), CadenceDatabase::class.java)

    private lateinit var database: CadenceDatabase
    private lateinit var storage: RoomHabitSyncStorage

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, CadenceDatabase::class.java)
            .addCallback(HabitSyncTriggers.callback)
            .allowMainThreadQueries()
            .build()
        storage = RoomHabitSyncStorage(database)
        database.openHelper.writableDatabase
    }

    @After
    fun tearDown() {
        database.close()
    }

    private fun sql(statement: String) = database.openHelper.writableDatabase.execSQL(statement)

    private fun outbox(): Set<String> =
        database.openHelper.writableDatabase.query("SELECT entity || '/' || uid || '/' || field FROM habit_sync_outbox").use {
            buildSet { while (it.moveToNext()) add(it.getString(0)) }
        }

    private fun insertHabit(id: String = "habit-0001", name: String = "Lire") = sql(
        "INSERT INTO habits (id, name, active, createdAtEpochMs) VALUES ('$id', '$name', 1, 1)",
    )

    @Test
    fun migrationMarksEveryExistingFieldForTheFirstSync() {
        helper.createDatabase("hs-migration", 25).apply {
            execSQL("INSERT INTO habits (id, name, active, createdAtEpochMs) VALUES ('habit-0001', 'Cardio', 1, 1)")
            execSQL(
                "INSERT INTO habit_timers (habitId, accumulatedSeconds, runningSinceEpochMs) VALUES ('habit-0001', 60, NULL)",
            )
            close()
        }
        helper.runMigrationsAndValidate("hs-migration", 26, true, CadenceDatabase.MIGRATION_25_26).use { db ->
            db.query("SELECT COUNT(*) FROM habit_sync_outbox WHERE entity = 'habit' AND uid = 'habit-0001'").use {
                it.moveToFirst()
                assertEquals(17, it.getInt(0))
            }
            db.query("SELECT field FROM habit_sync_outbox WHERE entity = 'habit_timer'").use {
                assertEquals(3, it.count)
            }
            db.query("SELECT COUNT(*) FROM habits").use {
                it.moveToFirst()
                assertEquals(1, it.getInt(0))
            }
        }
    }

    @Test
    fun insertNotesEveryFieldAndOnlyChangedFieldsAreNotedAfterwards() {
        insertHabit()
        assertTrue("habit/habit-0001/name" in outbox())
        sql("DELETE FROM habit_sync_outbox")

        sql("UPDATE habits SET name = 'Lire plus' WHERE id = 'habit-0001'")
        assertEquals(setOf("habit/habit-0001/name"), outbox())
        sql("DELETE FROM habit_sync_outbox")

        // Un remplacement par les mêmes valeurs ne note rien.
        sql("INSERT OR REPLACE INTO habits (id, name, active, createdAtEpochMs) VALUES ('habit-0001', 'Lire plus', 1, 1)")
        assertEquals(emptySet<String>(), outbox())
    }

    @Test
    fun deletingAHabitNotesTheHabitAndItsCascadedChildren() {
        insertHabit()
        sql("INSERT INTO habit_timers (habitId, accumulatedSeconds, runningSinceEpochMs) VALUES ('habit-0001', 0, NULL)")
        sql("DELETE FROM habit_sync_outbox")
        sql("DELETE FROM habits WHERE id = 'habit-0001'")
        val marks = outbox()
        assertTrue(marks.toString(), "habit/habit-0001/*delete" in marks)
        assertTrue(marks.toString(), "habit_timer/habit-0001/*delete" in marks)
    }

    @Test
    fun applyingAServerRowNotesNothingAndKeepsPendingLocalFields() = runBlocking {
        insertHabit()
        sql("DELETE FROM habit_sync_outbox")
        sql("UPDATE habits SET name = 'Local' WHERE id = 'habit-0001'")
        val server = buildJsonObject {
            put("uid", "habit-0001")
            put("name", "Serveur")
            put("description", "Du serveur")
        }
        assertTrue(storage.apply("habit", server) is ApplyResult.Applied)
        val row = storage.row("habit", "habit-0001")!!
        assertEquals("Local", row["name"])
        assertEquals("Du serveur", row["description"])
        assertEquals(setOf("habit/habit-0001/name"), outbox())
    }

    @Test
    fun aNewServerRowIsInsertedWithoutBeingSentBack() = runBlocking {
        val server = buildJsonObject {
            put("uid", "habit-0002")
            put("name", "Venue du serveur")
            put("active", true)
            put("client_created_at", kotlinx.serialization.json.JsonNull)
            put("created_at", "2026-10-01T10:00:00.000Z")
        }
        assertTrue(storage.apply("habit", server) is ApplyResult.Applied)
        assertEquals("Venue du serveur", storage.row("habit", "habit-0002")!!["name"])
        assertEquals("group-day", storage.row("habit", "habit-0002")!!["groupId"])
        assertEquals(emptySet<String>(), outbox())
    }

    @Test
    fun aChildWithoutParentIsSkippedNotCrashing() = runBlocking {
        val server = buildJsonObject {
            put("uid", "entry-0001")
            put("habit_uid", "missing-habit")
            put("occurred_at", "2026-10-01T10:00:00.000Z")
            put("local_date", "2026-10-01")
            put("observed_zone_id", "Europe/Zurich")
            put("value_minor", 1)
            put("source", "MANUAL")
        }
        assertTrue(storage.apply("habit_entry", server) is ApplyResult.Skipped)
        assertEquals(null, storage.row("habit_entry", "entry-0001"))
    }

    @Test
    fun aSecondAlcoholDayFromTheServerReplacesTheLocalOne() = runBlocking {
        insertHabit()
        sql("INSERT INTO alcohol_consumptions (id, habitId, localDate, observedZoneId, followUpNotified) VALUES ('alc-local-1', 'habit-0001', '2026-10-01', 'UTC', 0)")
        sql("DELETE FROM habit_sync_outbox")
        val server = buildJsonObject {
            put("uid", "alc-remote-1")
            put("habit_uid", "habit-0001")
            put("local_date", "2026-10-01")
            put("observed_zone_id", "UTC")
            put("follow_up_notified", false)
        }
        assertTrue(storage.apply("alcohol_consumption", server) is ApplyResult.Applied)
        assertEquals(null, storage.row("alcohol_consumption", "alc-local-1"))
        assertEquals("habit-0001", storage.row("alcohol_consumption", "alc-remote-1")!!["habitId"])
        assertEquals(emptySet<String>(), outbox())
    }

    @Test
    fun aServerDeleteRemovesTheRowAndItsChildrenWithoutNotingIt() = runBlocking {
        insertHabit()
        sql("INSERT INTO habit_timers (habitId, accumulatedSeconds, runningSinceEpochMs) VALUES ('habit-0001', 0, NULL)")
        sql("DELETE FROM habit_sync_outbox")
        storage.delete("habit", "habit-0001")
        assertEquals(null, storage.row("habit_timer", "habit-0001"))
        assertEquals(emptySet<String>(), outbox())
    }

    @Test
    fun pendingEntriesCameParentsFirstAndNeverCutARow() = runBlocking {
        insertHabit()
        sql("INSERT INTO habit_timers (habitId, accumulatedSeconds, runningSinceEpochMs) VALUES ('habit-0001', 0, NULL)")
        val entries = storage.pendingEntries(1)
        assertEquals(setOf("habit"), entries.map { it.entity }.toSet())
        assertEquals(17, entries.size)
    }

    @Test
    fun defaultGroupsAreStampedOldestPossible() = runBlocking {
        CadenceRepository(database).ensureDefaultGroups()
        database.openHelper.writableDatabase.query("SELECT DISTINCT changedMs FROM habit_sync_outbox WHERE entity = 'habit_group'").use {
            assertEquals(1, it.count)
            it.moveToFirst()
            assertEquals(1L, it.getLong(0))
        }
    }
}
