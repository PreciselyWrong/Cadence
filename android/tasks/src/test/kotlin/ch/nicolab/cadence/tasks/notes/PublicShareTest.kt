package ch.nicolab.cadence.tasks.notes

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PublicShareTest {
    @Test
    fun `parses enabled share and builds public url`() {
        val json = Json.parseToJsonElement(
            """{"enabled":true,"token":"abc-123","shared_at":"2026-11-20T10:00:00Z","public_inherit_style":false}""",
        ).jsonObject

        val state = PublicShareClient.parsePublicShare(json)

        assertTrue(state.enabled)
        assertEquals("abc-123", state.token)
        assertEquals("2026-11-20T10:00:00Z", state.sharedAt)
        assertFalse(state.inheritStyle)
        assertEquals("https://cadence.example/public/notes/abc-123", state.publicUrl("https://cadence.example/"))
    }

    @Test
    fun `disabled share without token yields null url`() {
        val json = Json.parseToJsonElement("""{"enabled":false,"token":null,"shared_at":null}""").jsonObject

        val state = PublicShareClient.parsePublicShare(json)

        assertFalse(state.enabled)
        assertNull(state.token)
        assertNull(state.publicUrl("https://cadence.example"))
        assertTrue(state.inheritStyle)
    }

    @Test
    fun `public notes flag is enabled when not hosted`() {
        val flags = Json.parseToJsonElement("""{"featureFlags":{"hosted":false,"billing":false}}""").jsonObject
        assertTrue(PublicShareClient.parsePublicNotesEnabled(flags, null))
    }

    @Test
    fun `public notes flag is hidden on trial when feature is false`() {
        val flags = Json.parseToJsonElement("""{"featureFlags":{"hosted":true}}""").jsonObject
        val billing = Json.parseToJsonElement("""{"reason":"trial","features":{"public_notes":false}}""").jsonObject
        assertFalse(PublicShareClient.parsePublicNotesEnabled(flags, billing))
    }

    @Test
    fun `public notes flag is enabled on hosted paid plan`() {
        val flags = Json.parseToJsonElement("""{"featureFlags":{"hosted":true}}""").jsonObject
        val billing = Json.parseToJsonElement("""{"reason":"active","features":{"public_notes":false}}""").jsonObject
        assertTrue(PublicShareClient.parsePublicNotesEnabled(flags, billing))
    }
}
