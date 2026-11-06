package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TaskSourceKeyMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsTheEmptySourceKeyAndKeepsTheCursor() {
        helper.createDatabase("source-key", 13).apply {
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("source-key", 14, true, MIGRATION_13_14).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use {
                assertTrue(it.moveToFirst())
                assertEquals("42", it.getString(0))
            }
            db.query("PRAGMA table_info(tasks)").use { columns ->
                val names = generateSequence { if (columns.moveToNext()) columns.getString(1) else null }.toList()
                assertTrue("sourceKey" in names)
            }
        }
    }
}
