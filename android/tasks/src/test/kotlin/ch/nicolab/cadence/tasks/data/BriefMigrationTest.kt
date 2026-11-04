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
class BriefMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationCreatesTheBriefTableAndKeepsTheCursorAndQueuedCalls() {
        helper.createDatabase("brief", 11).apply {
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            execSQL(
                "INSERT INTO deferred_calls (`key`, method, path, bodyJson, label, createdAtMs, attempts, lastError) " +
                    "VALUES ('review:w', 'POST', '/api/v1/review', NULL, 'Revue', 1, 0, NULL)",
            )
            close()
        }

        helper.runMigrationsAndValidate("brief", 12, true, MIGRATION_11_12).use { db ->
            db.execSQL(
                "INSERT INTO brief (`date`, json, version, status, generatedAt, fetchedAtMs) " +
                    "VALUES ('2026-11-04', '{\"date\":\"2026-11-04\"}', 1, 'ready', NULL, 7)",
            )
            db.query("SELECT json, version, status, generatedAt, fetchedAtMs FROM brief WHERE `date` = '2026-11-04'").use {
                assertTrue(it.moveToFirst())
                assertEquals("{\"date\":\"2026-11-04\"}", it.getString(0))
                assertEquals(1, it.getInt(1))
                assertEquals("ready", it.getString(2))
                assertTrue(it.isNull(3))
                assertEquals(7L, it.getLong(4))
            }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use {
                assertTrue(it.moveToFirst())
                assertEquals("42", it.getString(0))
            }
            db.query("SELECT label FROM deferred_calls WHERE `key` = 'review:w'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Revue", it.getString(0))
            }
        }
    }
}
