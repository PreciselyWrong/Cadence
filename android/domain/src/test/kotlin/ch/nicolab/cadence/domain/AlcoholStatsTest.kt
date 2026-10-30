package ch.nicolab.cadence.domain

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AlcoholStatsTest {
    private val today = LocalDate.of(2026, 9, 11)

    private fun consumption(
        back: Long,
        drinks: Int? = null,
        id: String = "c-$back",
        habitId: String = "alcohol",
    ) = AlcoholConsumption(id, habitId, today.minusDays(back), ZoneOffset.UTC, drinks)

    private fun stats(
        startsOn: LocalDate = today.minusDays(120),
        consumptions: List<AlcoholConsumption> = emptyList(),
        pauses: List<HabitPause> = emptyList(),
    ) = AlcoholStatsCalculator.compute("alcohol", startsOn, today, consumptions, pauses)

    @Test fun `consumption only accepts a positive known quantity`() {
        assertThrows(IllegalArgumentException::class.java) { consumption(0, 0) }
        assertThrows(IllegalArgumentException::class.java) { consumption(0, -1) }
        assertNull(consumption(0).standardDrinks)
    }

    @Test fun `calendar covers the last ninety days and distinguishes today`() {
        val result = stats(startsOn = today.minusDays(2), consumptions = listOf(consumption(1, 2), consumption(0)))

        assertTrue(result.days.size >= 365)
        assertEquals(3, result.observedDays30)
        assertEquals(3, result.observedDays90)
        assertEquals(3, result.observedDays365)
        assertEquals(3, result.observedDaysAllTime)
        assertEquals(AlcoholStatisticsDayStatus.UNOBSERVED, result.days.first().status)
        assertEquals(AlcoholStatisticsDayStatus.DRINKING, result.days[result.days.lastIndex - 1].status)
        assertEquals(2, result.days[result.days.lastIndex - 1].standardDrinks)
        assertEquals(AlcoholStatisticsDayStatus.TODAY_DRINKING, result.days.last().status)
        assertNull(result.days.last().standardDrinks)
        assertTrue(result.todayHasConsumption)
    }

    @Test fun `sober streaks only count completed days and pauses break them`() {
        val result = stats(
            startsOn = today.minusDays(10),
            consumptions = listOf(consumption(7, 1), consumption(3, 2)),
            pauses = listOf(HabitPause(today.minusDays(5), today.minusDays(4))),
        )

        assertEquals(2L, result.currentSoberDays)
        assertEquals(3L, result.bestSoberDays)
        assertFalse(result.isPaused)
        assertEquals(AlcoholStatisticsDayStatus.PAUSED, result.days[result.days.lastIndex - 5].status)
        assertEquals(0L, stats(consumptions = listOf(consumption(0, 1))).currentSoberDays)
        assertEquals(0L, stats(pauses = listOf(HabitPause(today, null))).currentSoberDays)
    }

    @Test fun `event windows include today while known quantities report completeness`() {
        val result = stats(consumptions = listOf(
            consumption(0, 2), consumption(5), consumption(20, 4), consumption(40, 3), consumption(100, 9),
        ))

        assertEquals(3, result.drinkingDays30)
        assertEquals(30, result.observedDays30)
        assertEquals(90, result.observedDays90)
        assertEquals(4, result.drinkingDays90)
        assertEquals(6, result.standardDrinks30)
        assertEquals(2, result.knownQuantityDays30)
        assertEquals(3, result.quantityDays30)
        assertEquals(listOf(today.minusDays(5)), result.pendingQuantityDates)
        assertEquals(3.0, result.averageDrinksPerDrinkingDay30)
        assertEquals(4, result.peakDrinksOnDrinkingDay30)
    }

    @Test fun `drink intensity excludes unknown amounts and paused dates`() {
        val result = stats(
            consumptions = listOf(consumption(0), consumption(1, 2), consumption(2, 5), consumption(3, 9)),
            pauses = listOf(HabitPause(today.minusDays(3), today.minusDays(2))),
        )
        assertEquals(3.5, result.averageDrinksPerDrinkingDay30)
        assertEquals(5, result.peakDrinksOnDrinkingDay30)
        assertNull(stats(consumptions = listOf(consumption(0))).averageDrinksPerDrinkingDay30)
    }

    @Test fun `pauses exclude events and intervals that cross them`() {
        val result = stats(
            consumptions = listOf(consumption(10, 1), consumption(2, 1), consumption(1, 1)),
            pauses = listOf(HabitPause(today.minusDays(8), today.minusDays(6))),
        )

        assertEquals(3, result.drinkingDays30)
        assertEquals(28, result.observedDays30)
        assertEquals(88, result.observedDays90)
        assertEquals(1.0, result.averageDaysBetweenDrinking)
        assertEquals(0.0, result.averageSoberDaysBetweenDrinking)
        assertFalse(result.exceedsUsualSoberGap)
        assertEquals(AlcoholStatisticsDayStatus.PAUSED, result.days[result.days.lastIndex - 8].status)
    }

    @Test fun `interval averages need two drinking dates and congratulations are strict`() {
        assertNull(stats(consumptions = listOf(consumption(3, 1))).averageDaysBetweenDrinking)
        assertNull(stats(consumptions = listOf(consumption(3, 1))).averageSoberDaysBetweenDrinking)

        val result = stats(consumptions = listOf(consumption(12, 1), consumption(7, 1)))
        assertEquals(5.0, result.averageDaysBetweenDrinking)
        assertEquals(4.0, result.averageSoberDaysBetweenDrinking)
        assertTrue(result.exceedsUsualSoberGap)
    }

    @Test fun `rest plans ignore unknown quantities and accumulate overlapping known days`() {
        val result = stats(consumptions = listOf(consumption(4, 3), consumption(2, 5), consumption(1)))

        assertEquals(AlcoholRestPlan(today.plusDays(4), today.plusDays(5)), result.restPlan)
        assertEquals(AlcoholRestPlan(today.plusDays(5), today.plusDays(6)),
            AlcoholStatsCalculator.restPlan(today, listOf(consumption(0, 5))))
        assertNull(stats(consumptions = listOf(consumption(10, 1))).restPlan)
    }

    @Test fun `drinks consumed before the current rest plan ends add their days cumulatively`() {
        val first = consumption(2, 2, id = "first")
        val nextDay = consumption(1, 2, id = "next-day")

        assertEquals(
            AlcoholRestPlan(today.plusDays(2), today.plusDays(3)),
            AlcoholStatsCalculator.restPlan(today, listOf(first, nextDay)),
        )
        assertEquals(
            AlcoholRestPlan(today.plusDays(4), today.plusDays(5)),
            AlcoholStatsCalculator.restPlan(today, listOf(first, nextDay.copy(standardDrinks = 4))),
        )
    }

    @Test fun `a consumption after a completed rest plan starts a new plan`() {
        assertEquals(
            AlcoholRestPlan(today.plusDays(1), today.plusDays(2)),
            AlcoholStatsCalculator.restPlan(today, listOf(consumption(10, 2), consumption(0, 1))),
        )
    }

    @Test fun `elapsed time without consumption starts at the declared instant`() {
        val declaredStart = today.minusDays(2).atTime(15, 30).toInstant(ZoneOffset.UTC)
        val now = today.atTime(18, 45, 12).toInstant(ZoneOffset.UTC)

        assertEquals(
            AbstinenceElapsed(2, 3, 15, 12),
            AlcoholElapsedCalculator.calculate("alcohol", declaredStart, emptyList(), now),
        )
    }

    @Test fun `elapsed time after a dated consumption starts when that civil day ends`() {
        val zurich = ZoneId.of("Europe/Zurich")
        val drinkingDay = LocalDate.of(2026, 3, 28)
        val declaredStart = drinkingDay.minusDays(10).atStartOfDay(zurich).toInstant()
        val consumption = AlcoholConsumption("latest", "alcohol", drinkingDay, zurich, 2)
        val now = drinkingDay.plusDays(2).atTime(4, 5, 6).atZone(zurich).toInstant()

        assertEquals(
            AbstinenceElapsed(1, 3, 5, 6),
            AlcoholElapsedCalculator.calculate("alcohol", declaredStart, listOf(consumption), now),
        )
        assertEquals(
            AbstinenceElapsed.ZERO,
            AlcoholElapsedCalculator.calculate(
                "alcohol",
                declaredStart,
                listOf(consumption),
                drinkingDay.atTime(23, 0).atZone(zurich).toInstant(),
            ),
        )
    }

    @Test fun `elapsed time after a live consumption starts at its observed instant`() {
        val observedAt = today.atTime(18, 45, 12).toInstant(ZoneOffset.UTC)
        val consumption = AlcoholConsumption(
            id = "live",
            habitId = "alcohol",
            localDate = today,
            observedZoneId = ZoneOffset.UTC,
            observedAt = observedAt,
        )

        assertEquals(
            AbstinenceElapsed(0, 0, 2, 3),
            AlcoholElapsedCalculator.calculate(
                "alcohol",
                today.minusDays(10).atStartOfDay(ZoneOffset.UTC).toInstant(),
                listOf(consumption),
                observedAt.plusSeconds(123),
            ),
        )
    }
}
