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
class FunnelColumnsMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsTheFunnelColumnsKeepsRowsAndResetsTheCursor() {
        helper.createDatabase("funnel", 5).apply {
            execSQL(
                "INSERT INTO tasks (uid, name, note, status, priority, dueDateRaw, dueHasTime, deferUntilRaw, reminderAtRaw, " +
                    "recurrenceType, projectUid, areaUid, parentTaskUid, tagUidsJson, completedAtRaw, pinnedAtRaw, fieldClocksJson, extrasJson) " +
                    "VALUES ('t1', 'Idée', NULL, 0, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, '[]', NULL, NULL, '{}', '{\"week_of\":\"2026-10-26\"}')",
            )
            execSQL("INSERT INTO projects (uid, name, status, color, areaUid, pinToSidebar, sourceType) VALUES ('p1', 'Alpha', 'in_progress', NULL, NULL, 0, NULL)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("funnel", 6, true, MIGRATION_5_6).use { db ->
            db.query("SELECT name, inViewAtRaw, weekOf, reviewOn, reviewedAtRaw FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Idée", it.getString(0))
                (1..4).forEach { column -> assertTrue(it.isNull(column)) }
            }
            db.execSQL("UPDATE tasks SET weekOf = '2026-10-26' WHERE uid = 't1'")
            db.query("SELECT weekOf FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("2026-10-26", it.getString(0))
            }
            db.query("SELECT reviewedAtRaw FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertTrue(it.isNull(0))
            }
            // Le prochain passage refait un instantané complet, qui remplit les nouvelles colonnes.
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
        }
    }
}
