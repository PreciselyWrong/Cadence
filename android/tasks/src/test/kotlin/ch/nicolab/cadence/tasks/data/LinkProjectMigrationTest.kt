package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LinkProjectMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationKeepsTheLinksAndResetsTheCursor() {
        helper.createDatabase("link-project", 15).apply {
            execSQL("INSERT INTO links (uid, url, tagUidsJson) VALUES ('l1', 'https://a.io/x', '[]')")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("link-project", 16, true, MIGRATION_15_16).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT url, projectUid FROM links WHERE uid = 'l1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("https://a.io/x", it.getString(0))
                assertTrue(it.isNull(1))
            }
        }
    }

    @Test
    fun aLinkReadsItsProjectFromTheWire() {
        val link = WireCodec.linkFromWire(
            Json.parseToJsonElement("""{"uid":"l1","url":"https://a.io/x","project_uid":"p1"}""").jsonObject,
        )
        assertEquals("p1", link.projectUid)
    }
}
