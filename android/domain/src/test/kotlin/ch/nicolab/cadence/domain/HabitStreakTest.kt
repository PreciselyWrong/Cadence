package ch.nicolab.cadence.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * La série compte des périodes planifiées réussies, jamais des jours calendaires.
 * Une pause, un voyage ou un saut autorisé traverse la série sans la casser ni la nourrir.
 */
class HabitStreakTest {

    private val zone = ZoneId.of("Europe/Zurich")
    private val today = LocalDate.of(2026, 6, 17) // mercredi

    private fun habit(
        period: PeriodType = PeriodType.DAY,
        mode: ScheduleMode = ScheduleMode.EVERY_DAY,
        days: Set<DayOfWeek> = DayOfWeek.entries.toSet(),
        intervalDays: Int = 2,
        target: Long = 1,
        startsOn: LocalDate = LocalDate.of(2026, 1, 1),
        frequency: Int? = null,
    ) = HabitDefinition(
        id = "habit-1",
        startsOn = startsOn,
        goal = HabitGoal(target, period, GoalType.QUANTITY, frequencyTarget = frequency),
        schedule = HabitSchedule(mode, days, DayOfWeek.MONDAY, intervalDays),
    )

    private fun entriesOn(vararg dates: LocalDate, value: Long = 1) = dates.mapIndexed { index, date ->
        HabitEntry(
            id = "entry-$index-$date",
            habitId = "habit-1",
            occurredAt = Instant.parse("2026-01-01T08:00:00Z").plusSeconds(index.toLong()),
            localDate = date,
            observedZoneId = zone,
            valueMinor = value,
            sessionId = "session-$index-$date",
        )
    }

    private fun streak(
        habit: HabitDefinition,
        entries: List<HabitEntry>,
        pauses: List<HabitPause> = emptyList(),
        on: LocalDate = today,
    ) = StreakCalculator.compute({ habit }, on, entries, pauses)

    @Test
    fun `no entry gives no streak`() {
        assertEquals(0, streak(habit(), emptyList()).current)
    }

    @Test
    fun `consecutive validated days build the streak`() {
        val days = (1..4).map { today.minusDays(it.toLong()) }

        assertEquals(4, streak(habit(), entriesOn(*days.toTypedArray())).current)
    }

    @Test
    fun `the current period counts only once validated and never breaks the streak`() {
        val past = (1..3).map { today.minusDays(it.toLong()) }.toTypedArray()

        // Aujourd'hui n'est pas encore fait : la période court toujours.
        assertEquals(3, streak(habit(), entriesOn(*past)).current)
        assertEquals(4, streak(habit(), entriesOn(*past, today)).current)
    }

    @Test
    fun `a missed day breaks the streak`() {
        val entries = entriesOn(today.minusDays(1), today.minusDays(3), today.minusDays(4))

        assertEquals(1, streak(habit(), entries).current)
    }

    @Test
    fun `a skipped day is neither a success nor a failure`() {
        val entries = entriesOn(today.minusDays(1), today.minusDays(3))
        val skipped = HabitPause.skip(today.minusDays(2), PauseReason.ILLNESS)

        // Le saut est traversé : les deux réussites se rejoignent, sans réussite artificielle.
        assertEquals(2, streak(habit(), entries, listOf(skipped)).current)
    }

    @Test
    fun `a travel does not create a streak on its own`() {
        val travel = HabitPause.travel(today.minusDays(5), today.minusDays(1))

        assertEquals(0, streak(habit(), emptyList(), listOf(travel)).current)
    }

    @Test
    fun `a travel bridges the periods around it`() {
        val entries = entriesOn(today.minusDays(6), today.minusDays(1))
        val travel = HabitPause.travel(today.minusDays(5), today.minusDays(2))

        assertEquals(2, streak(habit(), entries, listOf(travel)).current)
    }

    @Test
    fun `unplanned days are ignored instead of breaking the streak`() {
        // Habitude du lundi et du mercredi seulement.
        val onlyMonWed = habit(mode = ScheduleMode.SELECTED_DAYS, days = setOf(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY))
        val entries = entriesOn(
            today.minusDays(2), // lundi 15
            today.minusDays(7), // mercredi 10
            today.minusDays(9), // lundi 8
        )

        assertEquals(3, streak(onlyMonWed, entries).current)
    }

    @Test
    fun `an every N days rhythm counts only its planned days`() {
        val everyThree = habit(
            mode = ScheduleMode.INTERVAL_DAYS,
            intervalDays = 3,
            startsOn = LocalDate.of(2026, 6, 2),
        )
        // Jours planifiés : 2, 5, 8, 11, 14, 17 juin.
        val entries = entriesOn(LocalDate.of(2026, 6, 14), LocalDate.of(2026, 6, 11), LocalDate.of(2026, 6, 8))

        assertEquals(3, streak(everyThree, entries).current)
    }

    @Test
    fun `a weekly goal counts weeks not days`() {
        val weekly = habit(period = PeriodType.WEEK, target = 3)
        // Semaine courante : lundi 15 au mercredi 17. Semaine précédente : lundi 8 au dimanche 14.
        val entries = entriesOn(
            today, today.minusDays(1), today.minusDays(2),
            today.minusDays(3), today.minusDays(4), today.minusDays(5),
        )

        assertEquals(2, streak(weekly, entries).current)
    }

    @Test
    fun `the minimum validates the period, not the ideal`() {
        val withMinimum = HabitDefinition(
            id = "habit-1",
            startsOn = LocalDate.of(2026, 1, 1),
            goal = HabitGoal(targetMinor = 10, minimumMinor = 3, period = PeriodType.DAY),
            schedule = HabitSchedule(ScheduleMode.EVERY_DAY),
        )
        val entries = entriesOn(today.minusDays(1), today.minusDays(2), value = 3)

        assertEquals(2, streak(withMinimum, entries).current)
    }

    @Test
    fun `the frequency gates the period as well`() {
        val threeSessions = habit(target = 3, frequency = 3)
        val oneBigEntry = entriesOn(today.minusDays(1), value = 3)

        assertEquals(0, streak(threeSessions, oneBigEntry).current)
    }

    @Test
    fun `a goal change is read as it was at the time`() {
        val strictBefore = habit(target = 10)
        val lenientNow = habit(target = 1)
        val entries = entriesOn(today.minusDays(1), today.minusDays(2), value = 1)

        // La veille compte, l'avant-veille est lue avec l'ancien objectif et casse la série.
        val result = StreakCalculator.compute(
            { date -> if (date >= today.minusDays(1)) lenientNow else strictBefore },
            today,
            entries,
            emptyList(),
        )

        assertEquals(1, result.current)
    }

    @Test
    fun `days before the habit started never break the streak`() {
        val recent = habit(startsOn = today.minusDays(2))
        val entries = entriesOn(today.minusDays(1), today.minusDays(2))

        assertEquals(2, streak(recent, entries).current)
    }

    @Test
    fun `the best streak survives a later break`() {
        val entries = entriesOn(
            today.minusDays(1),
            today.minusDays(5), today.minusDays(6), today.minusDays(7), today.minusDays(8),
        )

        val result = streak(habit(), entries)

        assertEquals(1, result.current)
        assertEquals(4, result.best)
    }
}
