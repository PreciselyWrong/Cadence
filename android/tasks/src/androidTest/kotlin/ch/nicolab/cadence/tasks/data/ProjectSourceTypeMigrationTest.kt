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
class ProjectSourceTypeMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationKeepsProjectsWithoutSourceTypeAndResetsTheCursor() {
        helper.createDatabase("project-source", 4).apply {
            execSQL("INSERT INTO projects (uid, name, status, color, areaUid, pinToSidebar) VALUES ('p1', 'Alpha', 'in_progress', '#b91c1c', NULL, 1)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('last_sync_at', '1')")
            close()
        }

        helper.runMigrationsAndValidate("project-source", 5, true, MIGRATION_4_5).use { db ->
            db.query("SELECT name, status, color, pinToSidebar, sourceType FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Alpha", it.getString(0))
                assertEquals("in_progress", it.getString(1))
                assertEquals("#b91c1c", it.getString(2))
                assertEquals(1, it.getInt(3))
                assertTrue(it.isNull(4))
            }
            db.execSQL("UPDATE projects SET sourceType = 'todo_md' WHERE uid = 'p1'")
            db.query("SELECT sourceType FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("todo_md", it.getString(0))
            }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'last_sync_at'").use { assertTrue(it.moveToFirst()) }
        }
    }
}
