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
class NestedTagsMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsIconsAndParentsKeepsRowsAndResetsTheCursor() {
        helper.createDatabase("nested", 7).apply {
            execSQL("INSERT INTO projects (uid, name, status, color, areaUid, pinToSidebar) VALUES ('p1', 'Maison', 'in_progress', NULL, NULL, 0)")
            execSQL("INSERT INTO tags (uid, name, color) VALUES ('t1', 'sport', NULL)")
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("nested", 8, true, MIGRATION_7_8).use { db ->
            db.query("SELECT name, icon, parentProjectUid FROM projects WHERE uid = 'p1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Maison", it.getString(0))
                assertTrue(it.isNull(1))
                assertTrue(it.isNull(2))
            }
            db.query("SELECT name, icon, parentUid FROM tags WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("sport", it.getString(0))
                assertTrue(it.isNull(1))
                assertTrue(it.isNull(2))
            }
            // Le prochain passage refait un instantané complet : les étiquettes y arrivent avec leur chemin complet.
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
        }
    }
}
