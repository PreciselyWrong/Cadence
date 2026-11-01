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
class LinksMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationCreatesTheLinksTableAndResetsTheCursor() {
        helper.createDatabase("links", 8).apply {
            execSQL("INSERT INTO inbox_items (uid, content, status, createdAtRaw) VALUES ('i1', 'https://a.io', 'added', NULL)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("links", 9, true, MIGRATION_8_9).use { db ->
            db.execSQL(
                "INSERT INTO links (uid, url, tagUidsJson, status) VALUES ('l1', 'https://a.io/', '[]', 'new')",
            )
            db.query("SELECT url, status FROM links WHERE uid = 'l1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("https://a.io/", it.getString(0))
                assertEquals("new", it.getString(1))
            }
            db.query("SELECT content FROM inbox_items WHERE uid = 'i1'").use { assertTrue(it.moveToFirst()) }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
        }
    }
}
