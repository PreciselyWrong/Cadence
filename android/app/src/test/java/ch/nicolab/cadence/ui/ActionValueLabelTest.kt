package ch.nicolab.cadence.ui

import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.MeasurementUnit
import ch.nicolab.cadence.domain.UnitDimension
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ActionValueLabelTest {
    @Test
    fun `inline values include their unit once including fractional quantities`() {
        assertEquals("1 h 5 min", HabitFormatter.formatWithUnit(3900, GoalType.DURATION, MeasurementUnit.MINUTES))
        assertEquals("0.25 l", HabitFormatter.formatWithUnit(250, GoalType.QUANTITY, MeasurementUnit.LITERS))
        assertEquals("2 verres", HabitFormatter.formatWithUnit(2, GoalType.COUNT, MeasurementUnit.GLASS))
    }

    @Test
    fun `unit agrees with the quantity shown`() {
        assertEquals("1 verre", HabitFormatter.formatWithUnit(1, GoalType.COUNT, MeasurementUnit.GLASS))
        assertEquals("0 verre", HabitFormatter.formatWithUnit(0, GoalType.COUNT, MeasurementUnit.GLASS))
        assertEquals("5 pages", HabitFormatter.formatWithUnit(5, GoalType.COUNT, MeasurementUnit.PAGE))
        assertEquals("1 page", HabitFormatter.formatWithUnit(1, GoalType.COUNT, MeasurementUnit.PAGE))
        assertEquals("1 séance", HabitFormatter.formatWithUnit(1, GoalType.COUNT, MeasurementUnit.SESSION))
        assertEquals("3 séances", HabitFormatter.formatWithUnit(3, GoalType.COUNT, MeasurementUnit.SESSION))
    }

    @Test
    fun `scaled and custom units agree too`() {
        assertEquals("1 km", HabitFormatter.formatWithUnit(1000, GoalType.QUANTITY, MeasurementUnit.KILOMETERS))
        val cups = MeasurementUnit("cups", UnitDimension.CUSTOM, "Tasses", "tasses")
        assertEquals("1 tasse", HabitFormatter.formatWithUnit(1, GoalType.COUNT, cups))
        assertEquals("2 tasses", HabitFormatter.formatWithUnit(2, GoalType.COUNT, cups))
    }
}
