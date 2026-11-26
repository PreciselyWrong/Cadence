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
class SubProjectBoardMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsFileSectionAndHandoffColumnsAndResetsCursor() {
        helper.createDatabase("sub-project-board", 27).apply {
            execSQL(
                "INSERT INTO tasks (uid, name, status, dueHasTime, tagUidsJson, fieldClocksJson, extrasJson) " +
                    "VALUES ('t1', 'Puce', 0, 0, '[]', '{}', '{}')",
            )
            execSQL("INSERT INTO projects (uid, name, status, color, areaUid, pinToSidebar) VALUES ('p1', 'Alpha', 'in_progress', NULL, NULL, 0)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("sub-project-board", 28, true, MIGRATION_27_28).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT name, sourceSection, sourcePosition FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Puce", it.getString(0))
                assertTrue(it.isNull(1))
                assertTrue(it.isNull(2))
            }
            db.query("SELECT name, handoffJson FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Alpha", it.getString(0))
                assertTrue(it.isNull(1))
            }
            db.execSQL("UPDATE tasks SET sourceSection = 'Now', sourcePosition = 3 WHERE uid = 't1'")
            db.query("SELECT sourceSection, sourcePosition FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Now", it.getString(0))
                assertEquals(3, it.getInt(1))
            }
        }
    }
}
