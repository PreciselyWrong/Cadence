package ch.nicolab.cadence.tasks.sync

import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SyncFailureTest {
    @Test
    fun `une réponse du serveur, même en erreur, n'est jamais injoignable`() {
        listOf(
            httpFailure(400, """{"error":"unknown_entity"}"""),
            httpFailure(404, "<html>Not found</html>"),
            httpFailure(500, null),
            httpFailure(410, "<html>Gone</html>"),
            ProtocolError(),
            ResetRequired(),
            SSLHandshakeException("cert"),
        ).forEach { error ->
            assertFalse(isUnreachable(error), error.toString())
            assertFalse(describeFailure(error).contains("injoignable"), describeFailure(error))
        }
    }

    @Test
    fun `chaque erreur a son message précis`() {
        assertEquals("Requête refusée par le serveur (HTTP 400 : unknown_entity)", describeFailure(httpFailure(400, """{"error":"unknown_entity"}""")))
        assertEquals("Le serveur ne connaît pas cette requête (HTTP 404) : est-il à jour ?", describeFailure(httpFailure(404, null)))
        assertEquals("Trop de requêtes, nouvel essai dans quelques minutes (HTTP 429)", describeFailure(httpFailure(429, """{"error":"Rate limit exceeded"}""")))
        assertEquals("Serveur indisponible pour le moment (HTTP 502)", describeFailure(httpFailure(502, "<html>Bad gateway</html>")))
        assertEquals("Le serveur a mis trop de temps à répondre (HTTP 504)", describeFailure(httpFailure(504, null)))
        assertEquals("Connexion sécurisée refusée (certificat du serveur)", describeFailure(SSLHandshakeException("x")))
        assertEquals("Adresse du serveur introuvable", describeFailure(UnknownHostException("cadence.lan")))
        assertEquals("Le serveur ne répond pas (délai dépassé)", describeFailure(SocketTimeoutException()))
        assertEquals("Serveur injoignable", describeFailure(ConnectException("ECONNREFUSED")))
    }

    @Test
    fun `seules les pannes de transport sont hors ligne`() {
        assertTrue(isUnreachable(ConnectException()))
        assertTrue(isUnreachable(SocketTimeoutException()))
        assertTrue(isUnreachable(UnknownHostException()))
        assertTrue(isUnreachable(IOException("reset")))
        assertFalse(isUnreachable(IllegalStateException("bug")))
    }

    @Test
    fun `le code d'erreur d'un corps JSON est lu et borné`() {
        val error = httpFailure(400, """{"error":"${"x".repeat(500)}"}""") as HttpError
        assertEquals(80, error.error!!.length)
        assertEquals(null, (httpFailure(500, "<html/>") as HttpError).error)
        assertTrue((httpFailure(400, null) as HttpError).isClientError)
        assertFalse((httpFailure(429, null) as HttpError).isClientError)
        assertTrue((httpFailure(503, null) as HttpError).isUnavailable)
    }
}
