package ch.nicolab.cadence.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class HabitEntryCorrectionTest {

    private val zurich = ZoneId.of("Europe/Zurich")

    private val entry = HabitEntry(
        id = "entry-1",
        habitId = "habit-1",
        occurredAt = Instant.parse("2026-03-10T07:30:00Z"),
        localDate = LocalDate.of(2026, 3, 10),
        observedZoneId = zurich,
        valueMinor = 10,
        sessionId = "session-1",
        note = "Avant",
    )

    @Test
    fun `correcting only the value keeps the instant and the civil date`() {
        val corrected = HabitEntryCorrection.apply(entry, valueMinor = 25)

        assertEquals(25, corrected.valueMinor)
        assertEquals(entry.occurredAt, corrected.occurredAt)
        assertEquals(entry.localDate, corrected.localDate)
        assertEquals(zurich, corrected.observedZoneId)
        assertEquals("entry-1", corrected.id)
        assertEquals("session-1", corrected.sessionId)
    }

    @Test
    fun `a new date and time are read in the chosen zone`() {
        val corrected = HabitEntryCorrection.apply(
            entry,
            valueMinor = 10,
            localDate = LocalDate.of(2026, 3, 12),
            localTime = LocalTime.of(9, 15),
        )

        assertEquals(LocalDate.of(2026, 3, 12), corrected.localDate)
        // 09:15 à Zurich en mars = 08:15 UTC.
        assertEquals(Instant.parse("2026-03-12T08:15:00Z"), corrected.occurredAt)
        assertEquals(zurich, corrected.observedZoneId)
    }

    @Test
    fun `a correction can move the entry to another zone and keeps it`() {
        val tokyo = ZoneId.of("Asia/Tokyo")

        val corrected = HabitEntryCorrection.apply(
            entry,
            valueMinor = 10,
            localDate = LocalDate.of(2026, 3, 12),
            localTime = LocalTime.of(9, 15),
            observedZoneId = tokyo,
        )

        assertEquals(tokyo, corrected.observedZoneId)
        assertEquals(LocalDate.of(2026, 3, 12), corrected.localDate)
        assertEquals(Instant.parse("2026-03-12T00:15:00Z"), corrected.occurredAt)
    }

    @Test
    fun `the civil date always matches the instant read in the stored zone`() {
        val corrected = HabitEntryCorrection.apply(
            entry,
            valueMinor = 10,
            localDate = LocalDate.of(2026, 3, 12),
            localTime = LocalTime.of(0, 30),
        )

        assertEquals(
            corrected.localDate,
            corrected.occurredAt.atZone(corrected.observedZoneId).toLocalDate(),
        )
    }

    @Test
    fun `a note is replaced or cleared`() {
        assertEquals("Après", HabitEntryCorrection.apply(entry, valueMinor = 10, note = "Après").note)
        assertEquals(null, HabitEntryCorrection.apply(entry, valueMinor = 10, note = "  ").note)
        assertEquals("Avant", HabitEntryCorrection.apply(entry, valueMinor = 10).note)
    }

    @Test
    fun `a correction never produces a non positive value`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitEntryCorrection.apply(entry, valueMinor = 0)
        }
    }

    @Test
    fun `a skipped clock hour lands on the following valid instant`() {
        // 2026-03-29 02:30 n'existe pas à Zurich : l'heure avance de 02:00 à 03:00.
        val corrected = HabitEntryCorrection.apply(
            entry,
            valueMinor = 10,
            localDate = LocalDate.of(2026, 3, 29),
            localTime = LocalTime.of(2, 30),
        )

        assertEquals(Instant.parse("2026-03-29T01:30:00Z"), corrected.occurredAt)
        assertEquals(LocalDate.of(2026, 3, 29), corrected.localDate)
    }
}
