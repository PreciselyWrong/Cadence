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
class NotesPinPreviewMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationKeepsNotesUnpinnedCreatesPreviewCacheAndResetsTheCursor() {
        helper.createDatabase("notes-pin", 3).apply {
            execSQL("INSERT INTO notes (uid, title, content, color, projectUid, tagUidsJson, updatedAtRaw) VALUES ('n1', 'Titre', '- [ ] a', '#b91c1c', NULL, '[]', '2026-10-01T10:00:00Z')")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('last_sync_at', '1')")
            close()
        }

        helper.runMigrationsAndValidate("notes-pin", 4, true, MIGRATION_3_4).use { db ->
            db.query("SELECT title, content, color, pinned FROM notes WHERE uid = 'n1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Titre", it.getString(0))
                assertEquals("- [ ] a", it.getString(1))
                assertEquals("#b91c1c", it.getString(2))
                assertEquals(0, it.getInt(3))
            }
            db.execSQL("INSERT INTO link_previews (url, title, description, imageUrl, fetchedAtMs, failed) VALUES ('https://a.example', 'T', NULL, NULL, 1, 0)")
            db.query("SELECT COUNT(*) FROM link_previews").use {
                assertTrue(it.moveToFirst())
                assertEquals(1, it.getInt(0))
            }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'last_sync_at'").use { assertTrue(it.moveToFirst()) }
        }
    }
}
