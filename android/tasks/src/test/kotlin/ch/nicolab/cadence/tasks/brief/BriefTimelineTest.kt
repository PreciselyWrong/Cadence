package ch.nicolab.cadence.tasks.brief

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BriefTimelineTest {
    private val work = listOf(WorkDto(start = 480, end = 1020))

    @Test
    fun mapsTheAxisFromEightToTwentyTwoHours() {
        assertEquals(0f, BriefTimeline.fraction(8 * 60), 0.0001f)
        assertEquals(1f, BriefTimeline.fraction(22 * 60), 0.0001f)
        assertEquals(4f / 14f, BriefTimeline.fraction(12 * 60), 0.0001f)
        assertEquals(0f, BriefTimeline.fraction(6 * 60), 0.0001f)
        assertEquals(1f, BriefTimeline.fraction(23 * 60), 0.0001f)
    }

    @Test
    fun spanGivesLeftAndWidthAsFractions() {
        val (left, width) = BriefTimeline.span(12 * 60, 17 * 60)

        assertEquals(4f / 14f, left, 0.0001f)
        assertEquals(5f / 14f, width, 0.0001f)
    }

    @Test
    fun spanOfAnEmptyOrReversedIntervalHasNoWidth() {
        assertEquals(0f, BriefTimeline.span(600, 600).second, 0.0001f)
        assertEquals(0f, BriefTimeline.span(700, 600).second, 0.0001f)
    }

    @Test
    fun aTimedEventInsideWorkingHoursIsAConflict() {
        val dentist = EventDto(title = "Dentiste", startMinute = 13 * 60, endMinute = 14 * 60)

        assertTrue(BriefTimeline.overlapsWork(dentist, work))
        assertTrue(BriefTimeline.isConflict(dentist, work))
    }

    @Test
    fun anEventAfterWorkingHoursIsNotAConflictByItself() {
        val gym = EventDto(title = "Gym", startMinute = 18 * 60 + 30, endMinute = 19 * 60 + 30)

        assertFalse(BriefTimeline.overlapsWork(gym, work))
        assertFalse(BriefTimeline.isConflict(gym, work))
    }

    @Test
    fun anEventWithoutTimeNeverOverlapsWork() {
        assertFalse(BriefTimeline.overlapsWork(EventDto(title = "Journée", allDay = true), work))
    }

    @Test
    fun theEngineFlagAloneMarksAConflict() {
        assertTrue(BriefTimeline.isConflict(EventDto(title = "Double", conflict = true), emptyList()))
    }

    @Test
    fun loadLabelIsPlainWithoutCapacityRatioWhenFitting_andOverWhenExceeded() {
        assertEquals(LoadLabel.Plain(40), BriefTimeline.load(40, null))
        assertEquals(LoadLabel.Ratio(40, 90), BriefTimeline.load(40, 90))
        assertEquals(LoadLabel.Over(15), BriefTimeline.load(105, 90))
    }

    @Test
    fun eveningFillIsBoundedAndZeroWithoutCapacity() {
        assertEquals(0.5f, BriefTimeline.fill(45, 90), 0.0001f)
        assertEquals(1f, BriefTimeline.fill(200, 90), 0.0001f)
        assertEquals(0f, BriefTimeline.fill(45, null), 0.0001f)
        assertEquals(0f, BriefTimeline.fill(45, 0), 0.0001f)
    }
}
