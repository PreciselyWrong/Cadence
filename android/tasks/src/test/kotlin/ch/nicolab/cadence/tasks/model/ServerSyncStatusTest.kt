package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.ZoneOffset
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** `GET /sync/status` : appareils et conflits du serveur, fusionnés avec ceux du téléphone sans doublon. */
class ServerSyncStatusTest {
    private val json = Json.parseToJsonElement(
        """
        {"devices":[{"id":1,"name":"Laptop","last_used_at":"2026-10-31T10:00:00.000Z"},{"id":2,"name":"Pixel","last_used_at":null}],
         "last_change_at":"2026-11-01T08:00:00.000Z",
         "conflicts":[
          {"id":7,"entity":"task","uid":"t1","field":"name","name":"Appeler Paul","created_at":"2026-11-01T07:00:00.000Z",
           "lost":{"value":"Appeler Pierre"},"current":{"value":"Appeler Paul"},"can_keep_lost":true},
          {"id":8,"entity":"task","uid":"t2","field":"project_uid","name":"T","created_at":"2026-11-01T06:00:00.000Z",
           "lost":{"value":"p2","label":"Work"},"current":{"value":"p1","label":"Home"},"can_keep_lost":true},
          {"id":9,"entity":"habit","uid":"h1","field":"name","name":"Lire","created_at":"2026-11-01T05:00:00.000Z",
           "lost":{"value":"Lire 10 min"},"current":{"value":"Lire"},"can_keep_lost":false}
         ]}
        """.trimIndent(),
    ).jsonObject

    private val status = ServerSyncStatus.parse(json, ZoneOffset.UTC)

    @Test
    fun `lit les appareils et leur dernière synchro`() {
        assertEquals(
            listOf(SyncDevice("Laptop", Instant.parse("2026-10-31T10:00:00Z")), SyncDevice("Pixel", null)),
            status.devices,
        )
        assertEquals(Instant.parse("2026-11-01T08:00:00Z"), status.lastChangeAt)
    }

    @Test
    fun `lit les deux valeurs d'un conflit, une référence par son nom`() {
        val first = status.conflicts[0]
        assertEquals("7", first.id)
        assertEquals("task|t1|name", first.key)
        assertEquals("Tâche", first.entityLabel)
        assertEquals("Titre", first.fieldLabel)
        assertEquals("Appeler Pierre", first.lostText)
        assertEquals("Appeler Paul", first.currentText)
        assertTrue(first.canKeepLost)
        assertEquals("Work", status.conflicts[1].lostText)
        assertEquals("Home", status.conflicts[1].currentText)
        assertFalse(status.conflicts[2].canKeepLost)
    }

    private fun local(key: String, id: String = "local-$key") = SyncConflictItem(
        id = id, entityLabel = "Tâche", name = "x", fieldLabel = "Titre", localText = "a", serverText = "b",
        atMs = 0, canKeepLocal = true, key = key,
    )

    @Test
    fun `un même champ perdu par le téléphone et vu par le serveur ne fait qu'une ligne`() {
        val rows = SyncConflictMerge.merge(listOf(local("task|t1|name"), local("task|t9|note")), status.conflicts)

        assertEquals(4, rows.size)
        val server = rows.filterIsInstance<ConflictRow.Server>()
        assertEquals(listOf("7", "8", "9"), server.map { it.conflict.id })
        assertEquals("local-task|t1|name", server.first().localId)
        assertNull(server[1].localId)
        val localOnly = rows.filterIsInstance<ConflictRow.Local>()
        assertEquals(listOf("task|t9|note"), localOnly.map { it.item.key })
    }

    @Test
    fun `sans réponse du serveur, la liste du téléphone reste`() {
        val rows = SyncConflictMerge.merge(listOf(local("task|t1|name")), emptyList())
        assertEquals(listOf(ConflictRow.Local(local("task|t1|name"))), rows)
    }
}
