package ch.nicolab.cadence.tasks.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TodoMdFilesTest {
    private val files = TodoMdFiles.parse(
        Json.parseToJsonElement(
            """{"files":[
                {"folder":"alpha","path":"alpha/TODO.md","project_uid":"p1","project_name":"Alpha"},
                {"folder":"beta","path":"beta/TODO.md","project_uid":"p2","project_name":"Autre"},
                {"folder":"gamma","path":"gamma/TODO.md","project_uid":null,"project_name":null},
                {"path":"sans-dossier"}
            ]}""",
        ).jsonObject,
    )

    @Test
    fun `lit les fichiers et ignore une entrée sans dossier`() {
        assertEquals(listOf("alpha", "beta", "gamma"), files.map { it.folder })
        assertNull(files[2].projectUid)
    }

    @Test
    fun `le fichier du projet est reconnu, celui d'un autre projet n'est pas choisissable`() {
        assertEquals("alpha", TodoMdFiles.currentFolder(files, "p1"))
        assertNull(TodoMdFiles.currentFolder(files, "p3"))
        assertTrue(TodoMdFiles.selectable(files[0], "p1"))
        assertFalse(TodoMdFiles.selectable(files[1], "p1"))
        assertTrue(TodoMdFiles.selectable(files[2], "p1"))
    }
}
