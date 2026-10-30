package ch.nicolab.cadence.tasks.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HlcTest {
    private val format = Regex("""\d{13}-\d{4}-and[a-z0-9]{9}""")

    @Test
    fun `une valeur émise suit le format serveur`() {
        val hlc = Hlc(node = "and12345678a", wallClock = { 1_700_000_000_000L })

        val value = hlc.now()

        assertTrue(format.matches(value), value)
        assertEquals("1700000000000-0000-and12345678a", value)
    }

    @Test
    fun `les valeurs successives sont strictement croissantes, même à horloge figée`() {
        val hlc = Hlc(node = "and12345678a", wallClock = { 1_000L })

        val values = List(3) { hlc.now() }

        assertEquals(values.sorted(), values)
        assertEquals(values.toSet().size, values.size)
    }

    @Test
    fun `le compteur saturé avance la milliseconde comme le serveur`() {
        val hlc = Hlc(node = "and12345678a", wallClock = { 1_000L })
        repeat(Hlc.MAX_COUNTER + 1) { hlc.now() }

        val afterOverflow = hlc.now()

        assertEquals("0000000001001-0000-and12345678a", afterOverflow)
    }

    @Test
    fun `une horloge reçue plus récente est dépassée par l'écriture suivante`() {
        val hlc = Hlc(node = "and12345678a", wallClock = { 1_000L })

        hlc.observe("0000000001500-0003-server")

        assertEquals("0000000001500-0004-and12345678a", hlc.now())
    }

    @Test
    fun `une horloge mal formée ou trop en avance est ignorée`() {
        val hlc = Hlc(node = "and12345678a", wallClock = { 1_000L })

        hlc.observe("pas-une-horloge")
        hlc.observe("9999999999999-0000-server")

        assertEquals("0000000001000-0000-and12345678a", hlc.now())
    }

    @Test
    fun `le redémarrage reprend après la dernière valeur connue même si l'horloge recule`() {
        val before = Hlc(node = "and12345678a", wallClock = { 5_000L }).apply { now() }.state()

        val restarted = Hlc(node = "and12345678a", initial = before, wallClock = { 1_000L })

        assertTrue(restarted.now() > before)
    }
}
