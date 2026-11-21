package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CommentsAndAssignedToMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsTaskAssignedToAndCommentsTableAndResetsCursor() {
        helper.createDatabase("comments-and-assigned-to", 25).apply {
            execSQL(
                "INSERT INTO tasks (uid, name, status, dueHasTime, tagUidsJson, fieldClocksJson, extrasJson) " +
                    "VALUES ('t1', 'Appeler Paul', 0, 0, '[]', '{}', '{}')",
            )
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '99')")
            close()
        }

        helper.runMigrationsAndValidate("comments-and-assigned-to", 26, true, MIGRATION_25_26).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT name, assignedTo FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Appeler Paul", it.getString(0))
                assertTrue(it.isNull(1))
            }
            db.execSQL(
                "INSERT INTO comments (uid, taskUid, body, authorUid, authorName, createdAtRaw) " +
                    "VALUES ('c1', 't1', 'Salut', 'u1', 'Alice', '2026-11-21T09:00:00.000Z')",
            )
            db.query("SELECT body, authorName FROM comments WHERE uid = 'c1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Salut", it.getString(0))
                assertEquals("Alice", it.getString(1))
            }
        }
    }

    @Test
    fun wireCodecReadsTaskAssignedToAndComment() {
        val task = WireCodec.taskFromWire(
            Json.parseToJsonElement("""{"uid":"t1","name":"Appeler Paul","assigned_to":"person-1"}""").jsonObject,
        )
        assertEquals("person-1", task.assignedTo)
        assertEquals("person-1", WireCodec.taskToWire(task)["assigned_to"]?.let { it.toString().trim('"') })

        val comment = WireCodec.commentFromWire(
            Json.parseToJsonElement(
                """{"uid":"c1","task_uid":"t1","body":"Texte","author_uid":"u1","author_name":"Alice","created_at":"2026-11-21T09:00:00.000Z","deleted_at":null}""",
            ).jsonObject,
        )
        assertEquals("c1", comment.uid)
        assertEquals("t1", comment.taskUid)
        assertEquals("Texte", comment.body)
        assertEquals("u1", comment.authorUid)
        assertEquals("Alice", comment.authorName)
        assertNull(comment.deletedAtRaw)
    }
}
