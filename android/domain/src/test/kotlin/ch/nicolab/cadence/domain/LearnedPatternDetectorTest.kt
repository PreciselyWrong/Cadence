package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class LearnedPatternDetectorTest {
    private val untilExclusive = LocalDate.of(2026, 10, 29)
    private val since = LocalDate.of(2026, 1, 1)

    /** Jeudis en remontant depuis le 22 octobre 2026 : 12 jeudis tombent dans la fenêtre de 12 semaines. */
    private fun thursdays(count: Int): List<LocalDate> =
        (0 until count).map { LocalDate.of(2026, 10, 22).minusWeeks(it.toLong()) }

    private fun detect(
        logs: List<ObservedLog>,
        trackingSince: LocalDate = since,
        pauses: List<HabitPause> = emptyList(),
    ) = LearnedPatternDetector.detect(logs, untilExclusive, trackingSince, pauses)

    @Test fun `nine of twelve thursdays give nine hits over twelve observed`() {
        val pattern = detect(thursdays(9).map { ObservedLog(it) })

        val share = pattern.share(DayOfWeek.THURSDAY)
        assertEquals(9, share.hits)
        assertEquals(12, share.observed)
        DayOfWeek.entries.forEach { assertEquals(12, pattern.share(it).observed) }
    }

    @Test fun `several logs on one day count as a single hit`() {
        val day = thursdays(1).single()

        val pattern = detect(listOf(ObservedLog(day, 540), ObservedLog(day, 600), ObservedLog(day, 700)))

        assertEquals(1, pattern.share(DayOfWeek.THURSDAY).hits)
    }

    @Test fun `paused days are neither hits nor observed`() {
        val pauses = listOf(HabitPause.skip(LocalDate.of(2026, 10, 15), PauseReason.REST))

        val share = detect(thursdays(9).map { ObservedLog(it) }, pauses = pauses).share(DayOfWeek.THURSDAY)

        assertEquals(8, share.hits)
        assertEquals(11, share.observed)
    }

    @Test fun `days before tracking started are excluded`() {
        val share = detect(
            thursdays(9).map { ObservedLog(it) },
            trackingSince = LocalDate.of(2026, 9, 1),
        ).share(DayOfWeek.THURSDAY)

        assertEquals(8, share.hits)
        assertEquals(8, share.observed)
    }

    @Test fun `logs outside the window or on the excluded day are ignored`() {
        val logs = thursdays(12).map { ObservedLog(it) } +
            ObservedLog(LocalDate.of(2026, 7, 30)) +
            ObservedLog(untilExclusive)

        val share = detect(logs).share(DayOfWeek.THURSDAY)

        assertEquals(12, share.hits)
        assertEquals(12, share.observed)
    }

    @Test fun `usual minute is the lower median for an even number of logs`() {
        val minutes = listOf(600, 540, 660, 720)
        val logs = thursdays(4).zip(minutes) { day, minute -> ObservedLog(day, minute) }

        val pattern = detect(logs)

        assertEquals(600, pattern.share(DayOfWeek.THURSDAY).usualMinuteOfDay)
        assertEquals(600, pattern.usualMinuteOfDay)
    }

    @Test fun `usual minute is the middle value for an odd number of logs`() {
        val minutes = listOf(900, 540, 600)
        val logs = thursdays(3).zip(minutes) { day, minute -> ObservedLog(day, minute) }

        assertEquals(600, detect(logs).share(DayOfWeek.THURSDAY).usualMinuteOfDay)
    }

    @Test fun `usual minute is null when no log carries a minute`() {
        val pattern = detect(thursdays(2).map { ObservedLog(it) })

        assertNull(pattern.share(DayOfWeek.THURSDAY).usualMinuteOfDay)
        assertNull(pattern.usualMinuteOfDay)
    }

    @Test fun `observed log reads the civil date and minute in the observed zone`() {
        val entry = HabitEntry(
            id = "e",
            habitId = "h",
            occurredAt = Instant.parse("2026-10-22T23:30:00Z"),
            localDate = LocalDate.of(2026, 10, 23),
            observedZoneId = ZoneId.of("Asia/Tokyo"),
            valueMinor = 1,
        )

        assertEquals(ObservedLog(LocalDate.of(2026, 10, 23), 510), ObservedLog.of(entry))
    }

    @Test fun `alcohol log without observed instant has no minute`() {
        val consumption = AlcoholConsumption(
            id = "c",
            habitId = "h",
            localDate = LocalDate.of(2026, 10, 22),
            observedZoneId = ZoneId.of("Europe/Zurich"),
        )

        assertEquals(ObservedLog(LocalDate.of(2026, 10, 22), null), ObservedLog.of(consumption))
    }
}
