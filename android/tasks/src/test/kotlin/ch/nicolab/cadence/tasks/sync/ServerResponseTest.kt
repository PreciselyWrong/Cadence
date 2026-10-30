package ch.nicolab.cadence.tasks.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test

class ServerResponseTest {
    @Test
    fun `une page HTML à la place du JSON est une erreur de protocole`() {
        assertThrows(ProtocolError::class.java) { parseResponse("<html><body>Connexion</body></html>") }
    }

    @Test
    fun `un instantané sans curseur est une erreur de protocole`() {
        val body = parseResponse("""{"rows": []}""")

        assertThrows(ProtocolError::class.java) { snapshotPageOf(body) }
    }

    @Test
    fun `une réponse qui n'est pas un objet est une erreur de protocole`() {
        assertThrows(ProtocolError::class.java) { parseResponse("[1, 2, 3]") }
    }

    @Test
    fun `un résultat de push sans statut est une erreur de protocole`() {
        val body = parseResponse("""{"results": [{"op_id": "op-1"}]}""")

        assertThrows(ProtocolError::class.java) { pushResultsOf(body) }
    }

    @Test
    fun `un instantané valide se lit`() {
        val page = snapshotPageOf(parseResponse("""{"cursor": 42, "next": 500, "rows": [{"uid": "t1"}]}"""))

        assertEquals(42L, page.cursor)
        assertEquals(500L, page.next)
        assertEquals("t1", page.rows.single()["uid"]!!.jsonPrimitive.content)
    }
}
