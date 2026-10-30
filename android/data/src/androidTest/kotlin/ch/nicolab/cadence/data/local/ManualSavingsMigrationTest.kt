package ch.nicolab.cadence.data.local

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ManualSavingsMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        CadenceDatabase::class.java,
    )

    @Test fun migrationTurnsExistingDailyRateIntoDeclaredDailySpendingAndPreservesRelations() {
        helper.createDatabase("manual-savings", 19).apply {
            execSQL("INSERT INTO habits (id, name, active, createdAtEpochMs, abstinenceProfile, abstinenceSavingsDailyMinor, abstinenceSavingsCurrency) VALUES ('h', 'Sans alcool', 1, 1, 'ALCOHOL', 850, 'CHF')")
            execSQL("INSERT INTO habit_goals (id, habitId, targetMinor, period, effectiveFrom) VALUES ('g', 'h', 0, 'DAY', '2026-09-09')")
            close()
        }

        helper.runMigrationsAndValidate("manual-savings", 20, true, CadenceDatabase.MIGRATION_19_20).use { db ->
            val columns = buildList {
                db.query("PRAGMA table_info(habits)").use { cursor ->
                    while (cursor.moveToNext()) add(cursor.getString(1))
                }
            }
            assertTrue(columns.contains("abstinenceSavingsDailyMinor"))
            assertTrue(columns.contains("abstinenceSpendingMinor"))
            assertTrue(columns.contains("abstinenceSpendingPeriod"))
            db.query("SELECT abstinenceSpendingMinor, abstinenceSpendingPeriod, abstinenceSavingsCurrency FROM habits WHERE id = 'h'").use {
                assertTrue(it.moveToFirst())
                assertEquals(850L, it.getLong(0))
                assertEquals("DAY", it.getString(1))
                assertEquals("CHF", it.getString(2))
            }
            db.query("SELECT COUNT(*) FROM habit_goals WHERE habitId = 'h'").use {
                assertTrue(it.moveToFirst())
                assertEquals(1, it.getInt(0))
            }
        }
    }
}
