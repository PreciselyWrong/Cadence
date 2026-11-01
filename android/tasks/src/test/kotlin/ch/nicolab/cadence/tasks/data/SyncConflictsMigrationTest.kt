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
class SyncConflictsMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsConflictsAndDeferredCallsAndKeepsTheCursor() {
        helper.createDatabase("conflicts", 9).apply {
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("conflicts", 10, true, MIGRATION_9_10).use { db ->
            db.execSQL(
                "INSERT INTO sync_conflicts (id, entity, uid, field, localJson, serverJson, localText, serverText, displayName, atMs) " +
                    "VALUES ('task|t1|name', 'task', 't1', 'name', '\"a\"', '\"b\"', 'a', 'b', 'Courses', 1)",
            )
            db.execSQL(
                "INSERT INTO deferred_calls (`key`, method, path, bodyJson, label, createdAtMs, attempts, lastError) " +
                    "VALUES ('week-capacity', 'PUT', '/api/v1/review/week/capacity', '{}', 'Temps', 1, 0, NULL)",
            )
            db.query("SELECT localText, serverText FROM sync_conflicts").use {
                assertTrue(it.moveToFirst())
                assertEquals("a", it.getString(0))
                assertEquals("b", it.getString(1))
            }
            db.query("SELECT method FROM deferred_calls").use { assertTrue(it.moveToFirst()) }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use {
                assertTrue(it.moveToFirst())
                assertEquals("42", it.getString(0))
            }
        }
    }
}
