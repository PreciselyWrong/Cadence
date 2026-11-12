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
class LinkPagesMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationKeepsOnlyTheProjectPagesAndDropsTheRestOfTheLinks() {
        helper.createDatabase("link-pages", 20).apply {
            execSQL(
                "INSERT INTO links (uid, url, title, note, tagUidsJson, status, reviewAtRaw, sourceType, sourceUid, projectUid, fetchStatus, createdAtRaw) " +
                    "VALUES ('page', 'https://a.io/x', 'Guide', 'à relire', '[\"t1\"]', 'dropped', '2027-01-02', 'task', 't1', 'p1', 'done', '2026-10-01T00:00:00Z')",
            )
            execSQL(
                "INSERT INTO links (uid, url, tagUidsJson, status, sourceType, sourceUid) " +
                    "VALUES ('idea', 'https://b.io/y', '[]', 'new', 'inbox_item', 'i1')",
            )
            execSQL(
                "INSERT INTO deferred_calls (`key`, method, path, bodyJson, label, createdAtMs, attempts, lastError) " +
                    "VALUES ('link-add:inbox_item:i1:https://b.io/y', 'POST', '/api/v1/links', NULL, 'Ajouter aux liens', 1, 0, NULL)",
            )
            execSQL(
                "INSERT INTO deferred_calls (`key`, method, path, bodyJson, label, createdAtMs, attempts, lastError) " +
                    "VALUES ('triage-link-review:l9', 'POST', '/api/v1/triage/links/l9/review', NULL, 'Revue', 1, 0, NULL)",
            )
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("link-pages", 21, true, MIGRATION_20_21).use { db ->
            db.query("SELECT uid, url, title, note, projectUid, fetchStatus, createdAtRaw FROM links").use {
                assertTrue(it.moveToFirst())
                assertEquals("page", it.getString(0))
                assertEquals("https://a.io/x", it.getString(1))
                assertEquals("Guide", it.getString(2))
                assertEquals("à relire", it.getString(3))
                assertEquals("p1", it.getString(4))
                assertEquals("done", it.getString(5))
                assertEquals("2026-10-01T00:00:00Z", it.getString(6))
                assertFalse(it.moveToNext())
            }
            db.query("SELECT `key` FROM deferred_calls").use {
                assertTrue(it.moveToFirst())
                assertEquals("triage-link-review:l9", it.getString(0))
                assertFalse(it.moveToNext())
            }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
        }
    }
}
