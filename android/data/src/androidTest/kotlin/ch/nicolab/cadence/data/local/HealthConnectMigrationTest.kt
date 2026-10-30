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
class HealthConnectMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        CadenceDatabase::class.java,
    )

    @Test
    fun migrationAddsRulesAndImportTombstonesWithoutChangingHabits() {
        helper.createDatabase("health-connect-migration", 22).apply {
            execSQL("INSERT INTO habits (id, name, active, createdAtEpochMs) VALUES ('h', 'Cardio', 1, 1)")
            close()
        }

        helper.runMigrationsAndValidate(
            "health-connect-migration",
            23,
            true,
            CadenceDatabase.MIGRATION_22_23,
        ).use { db ->
            db.execSQL("INSERT INTO health_connect_rules (habitId, exerciseTypes, dataOriginPackage, enabled) VALUES ('h', '8,56', NULL, 1)")
            db.execSQL("INSERT INTO health_connect_imports (recordId, habitId, entryId, dataOriginPackage, state) VALUES ('r', 'h', 'e', 'com.strava', 'IGNORED')")
            db.query("SELECT COUNT(*) FROM habits WHERE id = 'h'").use {
                assertTrue(it.moveToFirst())
                assertEquals(1, it.getInt(0))
            }
            db.query("SELECT state FROM health_connect_imports WHERE recordId = 'r'").use {
                assertTrue(it.moveToFirst())
                assertEquals("IGNORED", it.getString(0))
            }
        }
    }
}
