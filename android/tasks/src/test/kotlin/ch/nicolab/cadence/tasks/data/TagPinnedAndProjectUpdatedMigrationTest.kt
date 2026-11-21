package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TagPinnedAndProjectUpdatedMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    /** Sans remise à zéro du curseur, les étiquettes épinglées et l'activité des projets déjà sur le serveur manqueraient. */
    @Test
    fun migrationAddsTagPinnedAndProjectUpdatedAtAndResetsCursor() {
        helper.createDatabase("tag-pinned-project-updated", 24).apply {
            execSQL("INSERT INTO tags (uid, name, color) VALUES ('t1', 'urgent', '#b91c1c')")
            execSQL("INSERT INTO projects (uid, name, status, color, areaUid, pinToSidebar) VALUES ('p1', 'Alpha', 'in_progress', '#b91c1c', NULL, 1)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("tag-pinned-project-updated", 25, true, MIGRATION_24_25).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT name, pinned FROM tags WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("urgent", it.getString(0))
                assertEquals(0, it.getInt(1))
            }
            db.query("SELECT name, updatedAtRaw FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Alpha", it.getString(0))
                assertTrue(it.isNull(1))
            }
        }
    }

    @Test
    fun tagAndProjectReadNewFieldsFromWire() {
        val tag = WireCodec.tagFromWire(
            Json.parseToJsonElement("""{"uid":"t1","name":"urgent","pinned":true}""").jsonObject,
        )
        assertTrue(tag.pinned)
        assertTrue(tag.toItem().pinned)

        val project = WireCodec.projectFromWire(
            Json.parseToJsonElement("""{"uid":"p1","name":"Alpha","updated_at":"2026-11-20T14:30:00.000Z"}""").jsonObject,
        )
        assertEquals("2026-11-20T14:30:00.000Z", project.updatedAtRaw)
        assertEquals(Instant.parse("2026-11-20T14:30:00.000Z"), project.toItem().updatedAt)
    }
}
