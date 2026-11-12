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
class BriefRemovalMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    private fun call(key: String) =
        "INSERT INTO deferred_calls (`key`, method, path, bodyJson, label, createdAtMs, attempts, lastError) " +
            "VALUES ('$key', 'POST', '/api/v1/x', NULL, 'x', 1, 0, NULL)"

    @Test
    fun migrationDropsTheBriefTablesAndTheirCallsAndKeepsTheRest() {
        helper.createDatabase("brief-removal", 21).apply {
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            execSQL(
                "INSERT INTO brief (`date`, json, version, status, generatedAt, fetchedAtMs) " +
                    "VALUES ('2026-11-12', '{}', 2, 'ready', NULL, 7)",
            )
            execSQL("INSERT INTO evening (`date`, json, fetchedAtMs) VALUES ('2026-11-12', '{}', 9)")
            listOf(
                "brief-seen:2026-11-12:MORNING",
                "brief-decision:k1",
                "brief-settings",
                "brief-answer:k2",
                "brief-carry:k3",
                "triage-apply:k4",
            ).forEach { execSQL(call(it)) }
            close()
        }

        helper.runMigrationsAndValidate("brief-removal", 22, true, MIGRATION_21_22).use { db ->
            db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('brief', 'evening')").use {
                assertFalse(it.moveToFirst())
            }
            db.query("SELECT `key` FROM deferred_calls ORDER BY `key`").use {
                val keys = buildList { while (it.moveToNext()) add(it.getString(0)) }
                assertEquals(listOf("brief-answer:k2", "brief-carry:k3", "triage-apply:k4"), keys)
            }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use {
                assertTrue(it.moveToFirst())
                assertEquals("42", it.getString(0))
            }
        }
    }
}
