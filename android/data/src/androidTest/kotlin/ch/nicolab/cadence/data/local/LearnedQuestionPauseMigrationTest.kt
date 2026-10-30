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
class LearnedQuestionPauseMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        CadenceDatabase::class.java,
    )

    @Test
    fun migrationKeepsExistingSettingsSilentDuringPauses() {
        helper.createDatabase("learned-pause-migration", 24).apply {
            execSQL("INSERT INTO habits (id, name, active, createdAtEpochMs) VALUES ('h', 'Lecture', 1, 1)")
            execSQL("INSERT INTO learned_question_settings (habitId, enabled, askAt, thresholdPercent, mutedWeekdays) VALUES ('h', 1, '09:00', 50, 'MONDAY')")
            close()
        }

        helper.runMigrationsAndValidate(
            "learned-pause-migration",
            25,
            true,
            CadenceDatabase.MIGRATION_24_25,
        ).use { db ->
            db.query("SELECT silentDuringPauses, mutedWeekdays FROM learned_question_settings WHERE habitId = 'h'").use {
                assertTrue(it.moveToFirst())
                assertEquals(1, it.getInt(0))
                assertEquals("MONDAY", it.getString(1))
            }
        }
    }
}
