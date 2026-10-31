package ch.nicolab.cadence.domain

import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class QuietHoursTest {
    private val zurich = ZoneId.of("Europe/Zurich")
    private val overnight = QuietHours(true, LocalTime.of(22, 0), LocalTime.of(7, 0))
    private val daytime = QuietHours(true, LocalTime.of(12, 0), LocalTime.of(14, 0))

    private fun at(local: String): Instant = LocalDateTime.parse(local).atZone(zurich).toInstant()

    @Test
    fun `an instant outside the window is left alone`() {
        val instant = at("2026-11-02T18:30:00")

        assertEquals(instant, overnight.shift(instant, zurich))
        assertNull(overnight.endAfter(instant, zurich))
    }

    @Test
    fun `a window crossing midnight pushes the evening to the next morning`() {
        assertEquals(at("2026-11-03T07:00:00"), overnight.shift(at("2026-11-02T22:00:00"), zurich))
        assertEquals(at("2026-11-03T07:00:00"), overnight.shift(at("2026-11-02T23:45:00"), zurich))
    }

    @Test
    fun `a window crossing midnight pushes the early morning to the same morning`() {
        assertEquals(at("2026-11-03T07:00:00"), overnight.shift(at("2026-11-03T00:00:00"), zurich))
        assertEquals(at("2026-11-03T07:00:00"), overnight.shift(at("2026-11-03T06:59:30"), zurich))
    }

    @Test
    fun `the end of the window is outside it`() {
        val end = at("2026-11-03T07:00:00")

        assertEquals(end, overnight.shift(end, zurich))
    }

    @Test
    fun `a same-day window ends the same day`() {
        assertEquals(at("2026-11-02T14:00:00"), daytime.shift(at("2026-11-02T12:00:00"), zurich))
        assertEquals(at("2026-11-02T14:00:00"), daytime.shift(at("2026-11-02T13:59:00"), zurich))
        assertEquals(at("2026-11-02T14:00:00"), daytime.shift(at("2026-11-02T14:00:00"), zurich))
        assertEquals(at("2026-11-02T11:59:00"), daytime.shift(at("2026-11-02T11:59:00"), zurich))
    }

    @Test
    fun `the window is read in the given zone, not the device one`() {
        val utc = ZoneId.of("UTC")
        val instant = Instant.parse("2026-11-02T21:30:00Z")

        assertEquals(instant, overnight.shift(instant, utc))
        assertEquals(Instant.parse("2026-11-03T06:00:00Z"), overnight.shift(instant, zurich))
    }

    @Test
    fun `a disabled window and an empty window never shift`() {
        val instant = at("2026-11-02T23:00:00")

        assertEquals(instant, overnight.copy(enabled = false).shift(instant, zurich))
        assertEquals(instant, QuietHours(true, LocalTime.of(7, 0), LocalTime.of(7, 0)).shift(instant, zurich))
    }

    @Test
    fun `the end follows the clock across a daylight saving change`() {
        // 2026-10-25 : fin de l'heure d'été, 03:00 redevient 02:00 à Zurich.
        val inside = at("2026-10-25T01:30:00")

        assertEquals(at("2026-10-25T07:00:00"), overnight.shift(inside, zurich))
    }

    @Test
    fun `parse reads the server shape and rejects malformed times`() {
        assertEquals(overnight, QuietHours.parse(true, "22:00", "07:00"))
        assertEquals(overnight.copy(enabled = false), QuietHours.parse(false, "22:00", "07:00"))
        assertNull(QuietHours.parse(true, "25:00", "07:00"))
        assertNull(QuietHours.parse(true, null, "07:00"))
        assertNull(QuietHours.parse(true, "22:00", "7h"))
    }

    @Test
    fun `a policy without hours shifts nothing`() {
        val instant = at("2026-11-02T23:00:00")

        assertEquals(instant, QuietPolicy.NONE.shift(instant))
        assertEquals(at("2026-11-03T07:00:00"), QuietPolicy(overnight, zurich).shift(instant))
    }
}
