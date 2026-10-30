package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Les statistiques ne concluent jamais sur un échantillon insuffisant : meilleur jour,
 * meilleur créneau et comparaison mensuelle restent absents tant que les données ne
 * portent pas la conclusion.
 */
class HabitInsightsTest {

    private val zone = ZoneId.of("Europe/Zurich")
    private val today = LocalDate.of(2026, 4, 15)

    private fun days(
        from: LocalDate = today.minusDays(83),
        to: LocalDate = today,
        planned: (LocalDate) -> Boolean = { true },
        paused: (LocalDate) -> Boolean = { false },
        minimum: Long = 60,
        target: Long = 100,
        dailyGoal: Boolean = true,
    ): List<InsightDay> = generateSequence(from) { it.plusDays(1) }
        .takeWhile { it <= to }
        .map { InsightDay(it, minimum, target, planned(it), paused(it), dailyGoal) }
        .toList()

    private var counter = 0

    private fun entry(date: LocalDate, time: LocalTime, value: Long) = HabitEntry(
        id = "entry-${counter++}",
        habitId = "habit-1",
        occurredAt = date.atTime(time).atZone(zone).toInstant(),
        localDate = date,
        observedZoneId = zone,
        valueMinor = value,
        sessionId = "session-${counter}",
    )

    @Test
    fun `no conclusion below the minimum sample`() {
        val entries = (0 until 5).map { entry(today.minusDays(it.toLong()), LocalTime.of(7, 0), 100) }

        val insights = HabitInsightsCalculator.of(entries, today, days())

        assertEquals(5, insights.observedEntryCount)
        assertNull(insights.bestDay)
        assertNull(insights.bestSlot)
    }

    @Test
    fun `sample count excludes entries outside planned unpaused days`() {
        val kept = entry(today, LocalTime.of(7, 0), 100)
        val paused = entry(today.minusDays(1), LocalTime.of(7, 0), 100)
        val unplanned = entry(today.minusDays(2), LocalTime.of(7, 0), 100)
        val observedDays = days(
            planned = { it != unplanned.localDate },
            paused = { it == paused.localDate },
        )

        val insights = HabitInsightsCalculator.of(listOf(kept, paused, unplanned), today, observedDays)

        assertEquals(1, insights.observedEntryCount)
    }

    @Test
    fun `best day of week emerges when one day clearly leads`() {
        val entries = buildList {
            generateSequence(today.minusDays(83)) { it.plusDays(1) }
                .takeWhile { it <= today }
                .forEach { date ->
                    val value = if (date.dayOfWeek == DayOfWeek.SATURDAY) 300L else 20L
                    add(entry(date, LocalTime.of(9, 0), value))
                }
        }

        val best = HabitInsightsCalculator.of(entries, today, days()).bestDay

        assertEquals(DayOfWeek.SATURDAY, best?.day)
        assertTrue(best!!.averageMinor > best.overallAverageMinor)
    }

    @Test
    fun `no best day when every day looks alike`() {
        val entries = generateSequence(today.minusDays(83)) { it.plusDays(1) }
            .takeWhile { it <= today }
            .map { entry(it, LocalTime.of(9, 0), 100) }
            .toList()

        assertNull(HabitInsightsCalculator.of(entries, today, days()).bestDay)
    }

    @Test
    fun `best slot follows the observed zone of each entry`() {
        val entries = generateSequence(today.minusDays(40)) { it.plusDays(1) }
            .takeWhile { it <= today }
            .map { entry(it, LocalTime.of(20, 30), 100) }
            .toList()

        val slot = HabitInsightsCalculator.of(entries, today, days()).bestSlot

        assertEquals(TimeSlot.EVENING, slot?.slot)
        assertTrue(slot!!.share > .9)
    }

    @Test
    fun `no best slot when entries are spread over the day`() {
        val hours = listOf(6, 12, 15, 19, 23)
        val entries = generateSequence(today.minusDays(59)) { it.plusDays(1) }
            .takeWhile { it <= today }
            .mapIndexed { index, date -> entry(date, LocalTime.of(hours[index % hours.size], 0), 100) }
            .toList()

        assertNull(HabitInsightsCalculator.of(entries, today, days()).bestSlot)
    }

    @Test
    fun `month comparison uses the same elapsed days on both months`() {
        val entries = buildList {
            (1..15).forEach { day -> add(entry(LocalDate.of(2026, 4, day), LocalTime.of(9, 0), 100)) }
            (1..30).forEach { day -> add(entry(LocalDate.of(2026, 3, day), LocalTime.of(9, 0), 100)) }
        }

        val comparison = HabitInsightsCalculator.of(entries, today, days()).monthComparison!!

        assertEquals(15, comparison.current.consideredDays)
        assertEquals(15, comparison.previous.consideredDays)
        assertEquals(1500, comparison.current.quantityMinor)
        assertEquals(1500, comparison.previous.quantityMinor)
        assertEquals(15, comparison.current.idealDays)
        assertEquals(15, comparison.current.minimumDays)
        assertEquals(15, comparison.current.activeDays)
    }

    @Test
    fun `paused days leave the comparison instead of counting as a miss`() {
        val entries = (1..15).map { entry(LocalDate.of(2026, 4, it), LocalTime.of(9, 0), 100) } +
            (1..10).map { entry(LocalDate.of(2026, 3, it), LocalTime.of(9, 0), 100) }
        val paused = days(paused = { it.month == java.time.Month.MARCH && it.dayOfMonth in 11..15 })

        val comparison = HabitInsightsCalculator.of(entries, today, paused).monthComparison!!

        assertEquals(10, comparison.previous.consideredDays)
        assertEquals(10, comparison.previous.activeDays)
    }

    @Test
    fun `minimum and ideal counts stay absent for a non daily goal`() {
        val entries = (1..15).map { entry(LocalDate.of(2026, 4, it), LocalTime.of(9, 0), 100) } +
            (1..15).map { entry(LocalDate.of(2026, 3, it), LocalTime.of(9, 0), 100) }

        val comparison = HabitInsightsCalculator.of(entries, today, days(dailyGoal = false)).monthComparison!!

        assertNull(comparison.current.minimumDays)
        assertNull(comparison.current.idealDays)
        assertEquals(1500, comparison.current.quantityMinor)
    }

    @Test
    fun `no comparison when the previous month is not covered`() {
        val entries = (1..15).map { entry(LocalDate.of(2026, 4, it), LocalTime.of(9, 0), 100) }

        val insights = HabitInsightsCalculator.of(entries, today, days(from = LocalDate.of(2026, 4, 1)))

        assertNull(insights.monthComparison)
    }

    @Test
    fun `no comparison when the previous month holds no planned day`() {
        val entries = (1..15).map { entry(LocalDate.of(2026, 4, it), LocalTime.of(9, 0), 100) }
        val plannedOnlyInApril = days(planned = { it.month == java.time.Month.APRIL })

        assertNull(HabitInsightsCalculator.of(entries, today, plannedOnlyInApril).monthComparison)
    }
}
