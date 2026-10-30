package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AbstinenceLapseSummaryTest {
    private val today = LocalDate.of(2026, 9, 8)

    private fun lapse(back: Long, id: String = "e$back") = HabitEntry(
        id, "h", today.minusDays(back).atStartOfDay().toInstant(ZoneOffset.UTC),
        today.minusDays(back), ZoneOffset.UTC, 1,
    )

    private fun summary(
        days: Long = 40,
        lapses: List<HabitEntry> = emptyList(),
        pauses: List<HabitPause> = emptyList(),
    ): AbstinenceLapseSummary = AbstinenceLapseSummary.of(
        AbstinenceStatsCalculator.compute("h", today.minusDays(days), today, lapses, pauses),
    )

    @Test fun `without lapses the record is the whole clear streak and there is no average gap`() {
        val result = summary()

        assertEquals(40L, result.recordDays)
        assertNull(result.averageGapDays)
        assertEquals(0, result.lapsesLast30Days)
    }

    @Test fun `a single lapse gives no average gap yet`() {
        val result = summary(lapses = listOf(lapse(5)))

        assertNull(result.averageGapDays)
        assertEquals(1, result.lapsesLast30Days)
    }

    @Test fun `record is the longest clear run and the average counts clear days between lapses`() {
        // Lapses 5 and 2 days ago : 35 clear days before the first, 2 between them.
        val result = summary(lapses = listOf(lapse(5), lapse(2)))

        assertEquals(35L, result.recordDays)
        assertEquals(2L, result.averageGapDays)
        assertEquals(2, result.lapsesLast30Days)
    }

    @Test fun `average gap is rounded to whole days half up`() {
        // Clear runs of 2 and 3 days between lapses : average 2.5 days, shown as 3.
        val result = summary(lapses = listOf(lapse(20), lapse(17), lapse(13)))

        assertEquals(3L, result.averageGapDays)
    }

    @Test fun `lapses older than thirty days leave the thirty day count`() {
        val result = summary(lapses = listOf(lapse(35), lapse(10)))

        assertEquals(1, result.lapsesLast30Days)
    }

    @Test fun `a lapse recorded during a pause is not counted`() {
        val result = summary(
            lapses = listOf(lapse(9), lapse(4)),
            pauses = listOf(HabitPause(today.minusDays(10), today.minusDays(8))),
        )

        assertEquals(1, result.lapsesLast30Days)
    }
}
