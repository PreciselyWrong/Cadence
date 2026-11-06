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
class ProjectImageMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    /** Sans remise à zéro du curseur, les images déjà posées sur le serveur n'arriveraient jamais. */
    @Test
    fun migrationAddsTheImageAndResetsTheCursor() {
        helper.createDatabase("project-image", 14).apply {
            execSQL("INSERT INTO projects (uid, name, status, color, areaUid, pinToSidebar) VALUES ('p1', 'Alpha', 'in_progress', '#b91c1c', NULL, 1)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("project-image", 15, true, MIGRATION_14_15).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT name, imageUrl FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Alpha", it.getString(0))
                assertTrue(it.isNull(1))
            }
        }
    }

    @Test
    fun aProjectReadsItsImageFromTheWire() {
        val project = WireCodec.projectFromWire(
            Json.parseToJsonElement("""{"uid":"p1","name":"Alpha","image_url":"/api/uploads/projects/a.jpg"}""").jsonObject,
        )
        assertEquals("/api/uploads/projects/a.jpg", project.imageUrl)
        assertEquals("/api/uploads/projects/a.jpg", project.toItem().imageUrl)
    }
}
