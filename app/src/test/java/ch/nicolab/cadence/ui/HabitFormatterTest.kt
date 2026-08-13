package ch.nicolab.cadence.ui

import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.MeasurementUnit
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HabitFormatterTest {
    @Test
    fun `duration combines hours and minutes from canonical seconds`() {
        assertEquals("1 h 30", HabitFormatter.formatValue(5_400, GoalType.DURATION, MeasurementUnit.MINUTES))
    }

    @Test
    fun `progress retains custom unit symbol`() {
        val pages = MeasurementUnit("pages", ch.nicolab.cadence.domain.UnitDimension.CUSTOM, "Pages", "pages")
        assertEquals("5 / 5 pages", HabitFormatter.formatProgress(5, 5, GoalType.QUANTITY, pages))
    }
}
