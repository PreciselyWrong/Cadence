package ch.nicolab.cadence.domain

import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ReminderLeadTest {
    @Test
    fun `les cinq choix vont de à l'heure à 30 minutes avant`() {
        assertEquals(listOf(0L, 5L, 10L, 15L, 30L), ReminderLead.entries.map { it.minutes })
    }

    @Test
    fun `l'instant de rappel précède le début de l'avance choisie`() {
        val start = Instant.parse("2026-11-02T09:00:00Z")

        assertEquals(start, ReminderLead.AT_TIME.notifyAt(start))
        assertEquals(Instant.parse("2026-11-02T08:50:00Z"), ReminderLead.TEN_MINUTES.notifyAt(start))
        assertEquals(Instant.parse("2026-11-02T08:30:00Z"), ReminderLead.THIRTY_MINUTES.notifyAt(start))
    }

    @Test
    fun `une valeur enregistrée inconnue retombe sur le défaut`() {
        assertEquals(ReminderLead.FIFTEEN_MINUTES, ReminderLead.ofMinutes(15, ReminderLead.TEN_MINUTES))
        assertEquals(ReminderLead.TEN_MINUTES, ReminderLead.ofMinutes(7, ReminderLead.TEN_MINUTES))
    }
}
