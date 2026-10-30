package ch.nicolab.cadence.domain

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class AbstinenceElapsedTest {

    private val habitId = "abstinence-alcohol"
    private val zone = ZoneId.of("Europe/Zurich")

    private fun entry(
        id: String,
        targetHabitId: String,
        occurredAt: Instant,
    ): HabitEntry = HabitEntry(
        id = id,
        habitId = targetHabitId,
        occurredAt = occurredAt,
        localDate = occurredAt.atZone(zone).toLocalDate(),
        observedZoneId = zone,
        valueMinor = 1L,
    )

    @Test
    fun `elapsed from declared start when there are no occurrences`() {
        val start = Instant.parse("2026-03-01T10:00:00Z")
        val now = start.plus(Duration.ofDays(2).plusHours(5).plusMinutes(30))

        val elapsed = AbstinenceElapsedCalculator.calculate(
            habitId = habitId,
            declaredStart = start,
            occurrences = emptyList(),
            now = now,
        )

        assertEquals(AbstinenceElapsed(days = 2L, hours = 5, minutes = 30, seconds = 0), elapsed)
    }

    @Test
    fun `latest matching occurrence resets the active run`() {
        val start = Instant.parse("2026-03-01T00:00:00Z")
        val occurrence1 = Instant.parse("2026-03-03T12:00:00Z")
        val occurrence2 = Instant.parse("2026-03-05T18:30:00Z")
        val now = occurrence2.plus(Duration.ofHours(8).plusMinutes(12))

        val occurrences = listOf(
            entry("e2", habitId, occurrence2),
            entry("e1", habitId, occurrence1),
        )

        val elapsed = AbstinenceElapsedCalculator.calculate(
            habitId = habitId,
            declaredStart = start,
            occurrences = occurrences,
            now = now,
        )

        assertEquals(AbstinenceElapsed(days = 0L, hours = 8, minutes = 12, seconds = 0), elapsed)
    }

    @Test
    fun `occurrence before declared start does not reset the run`() {
        val start = Instant.parse("2026-03-05T00:00:00Z")
        val priorOccurrence = Instant.parse("2026-03-01T12:00:00Z")
        val now = start.plus(Duration.ofDays(1).plusHours(3))

        val occurrences = listOf(entry("e0", habitId, priorOccurrence))

        val elapsed = AbstinenceElapsedCalculator.calculate(
            habitId = habitId,
            declaredStart = start,
            occurrences = occurrences,
            now = now,
        )

        assertEquals(AbstinenceElapsed(days = 1L, hours = 3, minutes = 0, seconds = 0), elapsed)
    }

    @Test
    fun `occurrences for other habits are ignored`() {
        val start = Instant.parse("2026-03-01T00:00:00Z")
        val otherOccurrence = Instant.parse("2026-03-05T00:00:00Z")
        val now = start.plus(Duration.ofDays(10))

        val occurrences = listOf(entry("e-other", "other-habit", otherOccurrence))

        val elapsed = AbstinenceElapsedCalculator.calculate(
            habitId = habitId,
            declaredStart = start,
            occurrences = occurrences,
            now = now,
        )

        assertEquals(AbstinenceElapsed(days = 10L, hours = 0, minutes = 0, seconds = 0), elapsed)
    }

    @Test
    fun `future declared start is clamped to zero`() {
        val now = Instant.parse("2026-03-01T12:00:00Z")
        val futureStart = now.plus(Duration.ofHours(2))

        val elapsed = AbstinenceElapsedCalculator.calculate(
            habitId = habitId,
            declaredStart = futureStart,
            occurrences = emptyList(),
            now = now,
        )

        assertEquals(AbstinenceElapsed(days = 0L, hours = 0, minutes = 0, seconds = 0), elapsed)
    }

    @Test
    fun `future occurrence is clamped to zero`() {
        val start = Instant.parse("2026-03-01T00:00:00Z")
        val now = Instant.parse("2026-03-05T12:00:00Z")
        val futureOccurrence = now.plus(Duration.ofMinutes(15))

        val occurrences = listOf(entry("e-future", habitId, futureOccurrence))

        val elapsed = AbstinenceElapsedCalculator.calculate(
            habitId = habitId,
            declaredStart = start,
            occurrences = occurrences,
            now = now,
        )

        assertEquals(AbstinenceElapsed(days = 0L, hours = 0, minutes = 0, seconds = 0), elapsed)
    }

    @Test
    fun `exact decomposition including seconds`() {
        val start = Instant.parse("2026-01-01T00:00:00Z")
        val duration = Duration.ofDays(42)
            .plusHours(17)
            .plusMinutes(43)
            .plusSeconds(59)
        val now = start.plus(duration)

        val elapsed = AbstinenceElapsedCalculator.calculate(
            habitId = habitId,
            declaredStart = start,
            occurrences = emptyList(),
            now = now,
        )

        assertEquals(42L, elapsed.days)
        assertEquals(17, elapsed.hours)
        assertEquals(43, elapsed.minutes)
        assertEquals(59, elapsed.seconds)
    }

    @Test
    fun `compact French formatter shows hours and minutes under one day`() {
        val elapsed = AbstinenceElapsed(days = 0L, hours = 8, minutes = 12, seconds = 45)
        assertEquals("8 h 12 min", elapsed.formatCompact())
    }

    @Test
    fun `compact French formatter shows days and hours at or over one day`() {
        val elapsedAtOneDay = AbstinenceElapsed(days = 1L, hours = 0, minutes = 15, seconds = 0)
        assertEquals("1 j 0 h", elapsedAtOneDay.formatCompact())

        val elapsedOverOneDay = AbstinenceElapsed(days = 23L, hours = 8, minutes = 12, seconds = 0)
        assertEquals("23 j 8 h", elapsedOverOneDay.formatCompact())
    }

    @Test
    fun `live French formatter keeps every elapsed component`() {
        val elapsed = AbstinenceElapsed(days = 23L, hours = 8, minutes = 12, seconds = 45)

        assertEquals("23 j · 8 h · 12 min · 45 s", elapsed.formatLive())
    }

    @Test
    fun `component bounds validation`() {
        assertThrows(IllegalArgumentException::class.java) {
            AbstinenceElapsed(days = -1L, hours = 0, minutes = 0, seconds = 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            AbstinenceElapsed(days = 0L, hours = 24, minutes = 0, seconds = 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            AbstinenceElapsed(days = 0L, hours = -1, minutes = 0, seconds = 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            AbstinenceElapsed(days = 0L, hours = 0, minutes = 60, seconds = 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            AbstinenceElapsed(days = 0L, hours = 0, minutes = -1, seconds = 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            AbstinenceElapsed(days = 0L, hours = 0, minutes = 0, seconds = 60)
        }
        assertThrows(IllegalArgumentException::class.java) {
            AbstinenceElapsed(days = 0L, hours = 0, minutes = 0, seconds = -1)
        }
    }
}
