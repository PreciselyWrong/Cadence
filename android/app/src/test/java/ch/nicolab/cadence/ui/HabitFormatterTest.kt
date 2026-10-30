package ch.nicolab.cadence.ui

import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.MeasurementUnit
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HabitFormatterTest {
    @Test
    fun `duration combines hours and minutes from canonical seconds`() {
        assertEquals("1 h 30 min", HabitFormatter.formatValue(5_400, GoalType.DURATION, MeasurementUnit.MINUTES))
    }

    @Test
    fun `duration below one minute stays in seconds`() {
        assertEquals("45 s", HabitFormatter.formatValue(45, GoalType.DURATION, MeasurementUnit.MINUTES))
    }

    @Test
    fun `duration of fifty nine minutes stays in minutes`() {
        assertEquals("59 min", HabitFormatter.formatValue(3_540, GoalType.DURATION, MeasurementUnit.MINUTES))
    }

    @Test
    fun `whole hour omits the minute part`() {
        assertEquals("1 h", HabitFormatter.formatValue(3_600, GoalType.DURATION, MeasurementUnit.MINUTES))
        assertEquals("3 h", HabitFormatter.formatValue(10_800, GoalType.DURATION, MeasurementUnit.HOURS))
    }

    @Test
    fun `one hour and five minutes keeps the minute unit`() {
        assertEquals("1 h 5 min", HabitFormatter.formatValue(3_900, GoalType.DURATION, MeasurementUnit.MINUTES))
    }

    @Test
    fun `large duration keeps hours and minutes`() {
        assertEquals("26 h 1 min", HabitFormatter.formatValue(93_660, GoalType.DURATION, MeasurementUnit.MINUTES))
    }

    @Test
    fun `duration progress never repeats the time unit`() {
        assertEquals(
            "1 h / 2 h",
            HabitFormatter.formatProgress(3_600, 7_200, GoalType.DURATION, MeasurementUnit.MINUTES),
        )
    }

    @Test
    fun `progress retains custom unit symbol`() {
        val pages = MeasurementUnit("pages", ch.nicolab.cadence.domain.UnitDimension.CUSTOM, "Pages", "pages")
        assertEquals("5 / 5 pages", HabitFormatter.formatProgress(5, 5, GoalType.QUANTITY, pages))
    }
}
