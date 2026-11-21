package ch.nicolab.cadence.tasks.google

import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GoogleSyncTest {
    @Test
    fun parsesUnconfiguredStatusAndIgnoresUnknownFields() {
        val body = Json.parseToJsonElement(
            """{"configured":false,"connected":false,"calendars":[],"extra":"ignored"}""",
        ).jsonObject
        val status = GoogleSyncParser.status(body)
        assertFalse(status.configured)
        assertFalse(status.connected)
        assertNull(status.email)
        assertNull(status.lastSyncedAt)
        assertNull(status.lastError)
    }

    @Test
    fun parsesConnectedStatusWithErrorAndTimestamp() {
        val body = Json.parseToJsonElement(
            """
            {
              "configured": true,
              "connected": true,
              "email": "nicolas@example.com",
              "sync_events": true,
              "sync_tasks": false,
              "last_synced_at": "2026-11-21T08:15:00.000Z",
              "last_error": "Token revoked",
              "calendars": [{"uid": "c1", "name": "Agenda"}]
            }
            """.trimIndent(),
        ).jsonObject
        val status = GoogleSyncParser.status(body)
        assertTrue(status.configured)
        assertTrue(status.connected)
        assertEquals("nicolas@example.com", status.email)
        assertEquals(Instant.parse("2026-11-21T08:15:00.000Z"), status.lastSyncedAt)
        assertEquals("Token revoked", status.lastError)
    }

    @Test
    fun handlesNullAndInvalidTimestampInStatus() {
        val body = Json.parseToJsonElement(
            """{"configured":true,"connected":true,"email":"  ","last_synced_at":"not-a-date","last_error":null}""",
        ).jsonObject
        val status = GoogleSyncParser.status(body)
        assertTrue(status.configured)
        assertTrue(status.connected)
        assertNull(status.email)
        assertNull(status.lastSyncedAt)
        assertNull(status.lastError)
    }

    @Test
    fun buildsOriginAndConnectPathWithoutApiSuffix() {
        assertEquals("https://cadence.example.com", GoogleSyncUrls.originOf("https://cadence.example.com/"))
        assertEquals("https://cadence.example.com:8443", GoogleSyncUrls.originOf("https://cadence.example.com:8443/api"))
        assertEquals("http://192.168.1.10:3002", GoogleSyncUrls.originOf("http://192.168.1.10:3002/"))
        assertEquals(
            "/api/v1/google/connect?origin=https%3A%2F%2Fcadence.example.com%3A8443&client=app",
            GoogleSyncUrls.connectPath("https://cadence.example.com:8443/api"),
        )
    }

    @Test
    fun parsesConnectUrlResponse() {
        val body = Json.parseToJsonElement("""{"url":"https://accounts.google.com/o/oauth2/v2/auth?x=1"}""").jsonObject
        assertEquals("https://accounts.google.com/o/oauth2/v2/auth?x=1", GoogleSyncParser.connectUrl(body))
        assertNull(GoogleSyncParser.connectUrl(Json.parseToJsonElement("""{"url":""}""").jsonObject))
    }

    @Test
    fun parsesReturnUrisForConnectedDeniedAndError() {
        assertEquals(GoogleOAuthOutcome.Connected, GoogleOAuthReturn.parse("cadence://google?google=connected"))
        assertEquals(GoogleOAuthOutcome.Denied, GoogleOAuthReturn.parse("cadence://google?google=denied"))
        assertEquals(
            GoogleOAuthOutcome.Error("Accès expiré"),
            GoogleOAuthReturn.parse("cadence://google?google=error&message=Acc%C3%A8s+expir%C3%A9"),
        )
        assertEquals(
            GoogleOAuthOutcome.Error(null),
            GoogleOAuthReturn.parse("cadence://google?google=error"),
        )
    }

    @Test
    fun ignoresUnrelatedReturnUris() {
        assertNull(GoogleOAuthReturn.parse(null))
        assertNull(GoogleOAuthReturn.parse(""))
        assertNull(GoogleOAuthReturn.parse("https://cadence.example.com/google?google=connected"))
        assertNull(GoogleOAuthReturn.parse("cadence://other?google=connected"))
        assertNull(GoogleOAuthReturn.parse("cadence://google?google=unknown"))
    }
}
