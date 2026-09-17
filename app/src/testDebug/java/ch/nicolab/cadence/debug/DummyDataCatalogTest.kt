package ch.nicolab.cadence.debug

import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.PeriodType
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DummyDataCatalogTest {
    private val today = LocalDate.of(2026, 9, 9)
    private val catalog = DummyDataCatalog.create(today, ZoneId.of("Europe/Zurich"))

    @Test
    fun `demo contains six ordinary habits with varied contracts`() {
        assertEquals(6, catalog.habits.size)
        assertTrue(catalog.habits.none { it.goal.isAbstinence })
        assertTrue(catalog.habits.map { it.goal.goalType }.containsAll(setOf(GoalType.BINARY, GoalType.COUNT, GoalType.QUANTITY, GoalType.DURATION)))
        assertTrue(catalog.habits.any { it.goal.period == PeriodType.WEEK })
        assertTrue(catalog.habits.any { it.goal.direction == GoalDirection.AT_MOST })
    }

    @Test
    fun `demo history is rich deterministic and internally consistent`() {
        assertTrue(catalog.entries.size >= 100)
        assertEquals(catalog.entries.map { it.id }.distinct().size, catalog.entries.size)
        assertTrue(catalog.habits.all { habit -> catalog.entries.any { it.habitId == habit.id } })
        assertTrue(catalog.entries.all { it.localDate in today.minusDays(59)..today })
        assertTrue(catalog.entries.all { it.occurredAt.atZone(it.observedZoneId).toLocalDate() == it.localDate })
        assertEquals(catalog, DummyDataCatalog.create(today, ZoneId.of("Europe/Zurich")))
        assertFalse(catalog.habits.any { it.id.isBlank() })
    }
}
