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
class GoalsAndNextActionMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsNextActionGoalLinkAndGoalsKeepsRowsAndResetsTheCursor() {
        helper.createDatabase("goals", 6).apply {
            execSQL(
                "INSERT INTO projects (uid, name, status, color, areaUid, pinToSidebar, sourceType, reviewedAtRaw) " +
                    "VALUES ('p1', 'Alpha', 'in_progress', NULL, NULL, 0, NULL, NULL)",
            )
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("goals", 7, true, MIGRATION_6_7).use { db ->
            db.query("SELECT name, nextTaskUid, goalUid FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Alpha", it.getString(0))
                assertTrue(it.isNull(1))
                assertTrue(it.isNull(2))
            }
            db.execSQL("INSERT INTO goals (uid, title, why, horizon, targetDateRaw, status, color, bucket, areaUid, parentGoalUid) VALUES ('g1', 'Santé', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
            db.query("SELECT title FROM goals WHERE uid = 'g1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Santé", it.getString(0))
            }
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
        }
    }
}
