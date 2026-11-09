package ch.nicolab.cadence.domain.handoff

import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProchesHandoffTest {
    private val certificate = ProchesHandoff.ALLOWED_CERTIFICATE_SHA256
    private val otherCertificate = "0".repeat(64)

    @Test fun `task uid is the name based uuid of the proposal id`() {
        val expected = UUID.nameUUIDFromBytes("proches-handoff:prop-1".toByteArray()).toString()

        assertEquals(expected, ProchesHandoff.taskUid("prop-1"))
    }

    @Test fun `task uid is stable for one proposal and distinct between proposals`() {
        assertEquals(ProchesHandoff.taskUid("prop-1"), ProchesHandoff.taskUid("prop-1"))
        assertNotEquals(ProchesHandoff.taskUid("prop-1"), ProchesHandoff.taskUid("prop-2"))
    }

    @Test fun `certificate matches case-insensitively and without colons`() {
        val colonSeparated = certificate.uppercase().chunked(2).joinToString(":")

        assertTrue(ProchesHandoff.isAllowedCertificate(certificate))
        assertTrue(ProchesHandoff.isAllowedCertificate(certificate.uppercase()))
        assertTrue(ProchesHandoff.isAllowedCertificate(colonSeparated))
    }

    @Test fun `other or empty certificates are refused`() {
        assertFalse(ProchesHandoff.isAllowedCertificate(otherCertificate))
        assertFalse(ProchesHandoff.isAllowedCertificate(""))
        assertFalse(ProchesHandoff.isAllowedCertificate(certificate.dropLast(1)))
    }

    @Test fun `every signer must match and at least one signer is required`() {
        assertFalse(ProchesHandoff.allSignersAllowed(emptyList()))
        assertFalse(ProchesHandoff.allSignersAllowed(listOf(certificate, otherCertificate)))
        assertTrue(ProchesHandoff.allSignersAllowed(listOf(certificate)))
        assertTrue(ProchesHandoff.allSignersAllowed(listOf(certificate, certificate.uppercase())))
    }

    @Test fun `valid request is trimmed and parsed`() {
        val request = ProchesHandoff.request("prop-1", "  Appeler Marie  ", "2026-11-12")

        assertEquals(HandoffRequest("prop-1", "Appeler Marie", LocalDate.of(2026, 11, 12)), request)
    }

    @Test fun `blank or missing title is refused`() {
        assertNull(ProchesHandoff.request("prop-1", "   ", "2026-11-12"))
        assertNull(ProchesHandoff.request("prop-1", null, "2026-11-12"))
    }

    @Test fun `title length is counted after trimming and capped at 200`() {
        val atLimit = "a".repeat(ProchesHandoff.MAX_TITLE_LENGTH)

        assertEquals(atLimit, ProchesHandoff.request("prop-1", "  $atLimit  ", "2026-11-12")?.title)
        assertNull(ProchesHandoff.request("prop-1", "a".repeat(ProchesHandoff.MAX_TITLE_LENGTH + 1), "2026-11-12"))
    }

    @Test fun `invalid due dates are refused`() {
        assertNull(ProchesHandoff.request("prop-1", "Titre", "2026-02-30"))
        assertNull(ProchesHandoff.request("prop-1", "Titre", "26-11-12"))
        assertNull(ProchesHandoff.request("prop-1", "Titre", "2026/11/12"))
        assertNull(ProchesHandoff.request("prop-1", "Titre", "2026-11-12T10:00"))
        assertNull(ProchesHandoff.request("prop-1", "Titre", null))
    }

    @Test fun `blank or oversized proposal ids are refused`() {
        assertNull(ProchesHandoff.request(" ", "Titre", "2026-11-12"))
        assertNull(ProchesHandoff.request(null, "Titre", "2026-11-12"))
        assertNull(ProchesHandoff.request("p".repeat(ProchesHandoff.MAX_PROPOSAL_ID_LENGTH + 1), "Titre", "2026-11-12"))
        assertEquals(
            "p".repeat(ProchesHandoff.MAX_PROPOSAL_ID_LENGTH),
            ProchesHandoff.request("p".repeat(ProchesHandoff.MAX_PROPOSAL_ID_LENGTH), "Titre", "2026-11-12")?.proposalId,
        )
    }
}
