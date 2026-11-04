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
class EveningMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsTheEveningTableAndKeepsTheMorningBriefTheCursorAndQueuedCalls() {
        helper.createDatabase("evening", 12).apply {
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            execSQL(
                "INSERT INTO brief (`date`, json, version, status, generatedAt, fetchedAtMs) " +
                    "VALUES ('2026-11-04', '{\"date\":\"2026-11-04\"}', 2, 'ready', NULL, 7)",
            )
            execSQL(
                "INSERT INTO deferred_calls (`key`, method, path, bodyJson, label, createdAtMs, attempts, lastError) " +
                    "VALUES ('brief-carry:k', 'POST', '/api/v1/daily-plan/2026-11-05/carry-over', NULL, 'Report', 1, 0, NULL)",
            )
            close()
        }

        helper.runMigrationsAndValidate("evening", 13, true, MIGRATION_12_13).use { db ->
            db.execSQL("INSERT INTO evening (`date`, json, fetchedAtMs) VALUES ('2026-11-04', '{\"schema\":1}', 9)")
            db.query("SELECT json, fetchedAtMs FROM evening WHERE `date` = '2026-11-04'").use {
                assertTrue(it.moveToFirst())
                assertEquals("{\"schema\":1}", it.getString(0))
                assertEquals(9L, it.getLong(1))
            }
            db.query("SELECT version, status FROM brief WHERE `date` = '2026-11-04'").use {
                assertTrue(it.moveToFirst())
                assertEquals(2, it.getInt(0))
                assertEquals("ready", it.getString(1))
            }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use {
                assertTrue(it.moveToFirst())
                assertEquals("42", it.getString(0))
            }
            db.query("SELECT label FROM deferred_calls WHERE `key` = 'brief-carry:k'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Report", it.getString(0))
            }
        }
    }
}
