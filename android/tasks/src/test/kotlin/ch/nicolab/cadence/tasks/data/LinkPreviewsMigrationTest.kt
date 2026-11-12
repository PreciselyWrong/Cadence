package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LinkPreviewsMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationKeepsCachedPreviewsAndLeavesTheNewFieldsEmpty() {
        helper.createDatabase("link-previews", 19).apply {
            execSQL("INSERT INTO link_previews (url, title, description, imageUrl, fetchedAtMs, failed) VALUES ('https://a.example', 'Titre', NULL, NULL, 1000, 0)")
            close()
        }

        helper.runMigrationsAndValidate("link-previews", 20, true, MIGRATION_19_20).use { db ->
            db.query("SELECT title, siteName, kind, githubStars, githubLanguage, githubLastCommit FROM link_previews WHERE url = 'https://a.example'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Titre", it.getString(0))
                for (column in 1..5) assertTrue("colonne $column vide", it.isNull(column))
            }
        }
    }
}
