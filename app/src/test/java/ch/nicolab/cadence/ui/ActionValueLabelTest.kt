package ch.nicolab.cadence.ui

import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.MeasurementUnit
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ActionValueLabelTest {
    @Test
    fun `inline values include their unit once including fractional quantities`() {
        assertEquals("1 h 5 min", HabitFormatter.formatWithUnit(3900, GoalType.DURATION, MeasurementUnit.MINUTES))
        assertEquals("0.25 l", HabitFormatter.formatWithUnit(250, GoalType.QUANTITY, MeasurementUnit.LITERS))
        assertEquals("2 verres", HabitFormatter.formatWithUnit(2, GoalType.COUNT, MeasurementUnit.GLASS))
    }
}
