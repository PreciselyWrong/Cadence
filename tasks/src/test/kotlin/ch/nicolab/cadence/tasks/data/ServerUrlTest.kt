package ch.nicolab.cadence.tasks.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ServerUrlTest {
    @Test
    fun `ajoute https et retire le slash final`() {
        assertEquals("https://tududi.tail.ts.net", normalizeServerUrl("  tududi.tail.ts.net/ "))
    }

    @Test
    fun `garde le schéma saisi`() {
        assertEquals("http://192.168.1.10:3002", normalizeServerUrl("http://192.168.1.10:3002/"))
    }

    @Test
    fun `refuse une adresse vide ou sans hôte`() {
        assertNull(normalizeServerUrl("   "))
        assertNull(normalizeServerUrl("https://"))
    }

    @Test
    fun `accepte seulement http et https`() {
        assertEquals("HTTPS://tududi.example", normalizeServerUrl("HTTPS://tududi.example"))
        assertNull(normalizeServerUrl("ftp://tududi.example"))
        assertNull(normalizeServerUrl("file:///etc/passwd"))
        assertNull(normalizeServerUrl("javascript:alert(1)"))
        assertNull(normalizeServerUrl("content://media/external"))
    }
}
