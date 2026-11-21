package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProjectSectionsMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    @Test
    fun migrationAddsTaskSectionColumnsAndProjectSectionsTableAndResetsCursor() {
        helper.createDatabase("project-sections", 26).apply {
            execSQL(
                "INSERT INTO tasks (uid, name, status, dueHasTime, tagUidsJson, fieldClocksJson, extrasJson) " +
                    "VALUES ('t1', 'Maquette', 0, 0, '[]', '{}', '{}')",
            )
            execSQL("INSERT INTO sync_meta (`key`, value) VALUES ('cursor', '42')")
            close()
        }

        helper.runMigrationsAndValidate("project-sections", 27, true, MIGRATION_26_27).use { db ->
            db.query("SELECT value FROM sync_meta WHERE `key` = 'cursor'").use { assertFalse(it.moveToFirst()) }
            db.query("SELECT name, sectionUid, sectionPosition FROM tasks WHERE uid = 't1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("Maquette", it.getString(0))
                assertTrue(it.isNull(1))
                assertTrue(it.isNull(2))
            }
            db.execSQL(
                "INSERT INTO project_sections (uid, projectUid, name, position) " +
                    "VALUES ('s1', 'p1', 'En cours', 1)",
            )
            db.query("SELECT projectUid, name, position FROM project_sections WHERE uid = 's1'").use {
                assertTrue(it.moveToFirst())
                assertEquals("p1", it.getString(0))
                assertEquals("En cours", it.getString(1))
                assertEquals(1, it.getInt(2))
            }
        }
    }

    @Test
    fun wireCodecReadsAndWritesSectionAndTaskPlacement() {
        val task = WireCodec.taskFromWire(
            Json.parseToJsonElement(
                """{"uid":"t1","name":"Maquette","section_uid":"s1","section_position":2}""",
            ).jsonObject,
        )
        assertEquals("s1", task.sectionUid)
        assertEquals(2, task.sectionPosition)
        val taskWire = WireCodec.taskToWire(task)
        assertEquals("s1", taskWire["section_uid"]?.jsonPrimitive?.content)
        assertEquals(2, taskWire["section_position"]?.jsonPrimitive?.intOrNull)

        val section = WireCodec.sectionFromWire(
            Json.parseToJsonElement(
                """{"uid":"s1","project_uid":"p1","name":"À faire","position":0}""",
            ).jsonObject,
        )
        assertEquals("s1", section.uid)
        assertEquals("p1", section.projectUid)
        assertEquals("À faire", section.name)
        assertEquals(0, section.position)
        val sectionWire = WireCodec.sectionToWire(section)
        assertEquals("p1", sectionWire["project_uid"]?.jsonPrimitive?.content)
        assertEquals("À faire", sectionWire["name"]?.jsonPrimitive?.content)
        assertEquals(0, sectionWire["position"]?.jsonPrimitive?.intOrNull)
    }
}
