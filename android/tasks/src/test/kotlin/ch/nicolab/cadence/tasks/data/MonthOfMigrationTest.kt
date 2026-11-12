package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MonthOfMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsAnEmptyMonthAndResetsTheCursor() {
        helper.createDatabase("month-of", 17).apply {
            execSQL("INSERT INTO tasks (uid, name, status, dueHasTime, tagUidsJson, fieldClocksJson, extrasJson, needsWhen) VALUES ('t1', 'Facture', 0, 0, '[]', '{}', '{}', 0)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("month-of", 18, true, MIGRATION_17_18).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT name, monthOf FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Facture", it.getString(0))
                assertNull(it.getString(1))
            }
        }
    }
}
