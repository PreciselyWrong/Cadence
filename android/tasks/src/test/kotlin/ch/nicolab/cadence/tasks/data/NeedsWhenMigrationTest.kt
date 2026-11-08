package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NeedsWhenMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationKeepsTheTasksDefaultsTheFlagAndResetsTheCursor() {
        helper.createDatabase("needs-when", 16).apply {
            execSQL("INSERT INTO tasks (uid, name, status, dueHasTime, tagUidsJson, fieldClocksJson, extrasJson) VALUES ('t1', 'Facture', 0, 0, '[]', '{}', '{}')")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("needs-when", 17, true, MIGRATION_16_17).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT name, needsWhen FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Facture", it.getString(0))
                assertEquals(0, it.getInt(1))
            }
        }
    }
}
