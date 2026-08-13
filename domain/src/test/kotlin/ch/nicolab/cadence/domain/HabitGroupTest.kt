package ch.nicolab.cadence.domain

import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitGroupTest {

    private val day = HabitGroup.defaults()[0]
    private val morning = HabitGroup.defaults()[1]
    private val afternoon = HabitGroup.defaults()[2]
    private val evening = HabitGroup.defaults()[3]

    @Test
    fun `default groups start with an all day group without schedule`() {
        val defaults = HabitGroup.defaults()

        assertEquals(listOf("Journée", "Matin", "Après-midi", "Soir"), defaults.map(HabitGroup::name))
        assertEquals(HabitGroup.ALL_DAY_ID, defaults.first().id)
        assertTrue(defaults.first().isAllDay)
        assertTrue(defaults.drop(1).none(HabitGroup::isAllDay))
    }

    @Test
    fun `an all day group is active at every instant`() {
        assertTrue(day.isActiveAt(LocalTime.MIDNIGHT))
        assertTrue(day.isActiveAt(LocalTime.of(13, 37)))
        assertTrue(day.isActiveAt(LocalTime.of(23, 59)))
    }

    @Test
    fun `a range includes its start and excludes its end`() {
        assertTrue(morning.isActiveAt(LocalTime.of(5, 0)))
        assertTrue(morning.isActiveAt(LocalTime.of(11, 59)))
        assertFalse(morning.isActiveAt(LocalTime.of(12, 0)))
        assertFalse(morning.isActiveAt(LocalTime.of(4, 59)))
    }

    @Test
    fun `a range crossing midnight stays active on both sides`() {
        val night = HabitGroup("night", "Nuit", startMinute = 22 * 60, endMinute = 5 * 60, sortOrder = 4)

        assertTrue(night.isActiveAt(LocalTime.of(22, 0)))
        assertTrue(night.isActiveAt(LocalTime.of(23, 59)))
        assertTrue(night.isActiveAt(LocalTime.MIDNIGHT))
        assertTrue(night.isActiveAt(LocalTime.of(4, 59)))
        assertFalse(night.isActiveAt(LocalTime.of(5, 0)))
        assertFalse(night.isActiveAt(LocalTime.of(12, 0)))
    }

    @Test
    fun `a range covering the whole clock is always active`() {
        val nonstop = HabitGroup("nonstop", "Non-stop", startMinute = 8 * 60, endMinute = 8 * 60, sortOrder = 4)

        assertTrue(nonstop.isActiveAt(LocalTime.of(8, 0)))
        assertTrue(nonstop.isActiveAt(LocalTime.of(7, 59)))
    }

    @Test
    fun `a group keeps either both bounds or none`() {
        assertThrows(IllegalArgumentException::class.java) {
            HabitGroup("half", "Moitié", startMinute = 60, endMinute = null, sortOrder = 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            HabitGroup("late", "Tard", startMinute = 24 * 60, endMinute = 0, sortOrder = 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            HabitGroup("blank", " ", startMinute = null, endMinute = null, sortOrder = 1)
        }
    }

    @Test
    fun `active groups keep all day groups and overlapping ranges together`() {
        val overlapping = HabitGroup("sport", "Sport", startMinute = 11 * 60, endMinute = 14 * 60, sortOrder = 4)
        val groups = listOf(day, morning, afternoon, evening, overlapping)

        val active = HabitGroup.activeAt(groups, LocalTime.of(11, 30))

        assertEquals(listOf("Journée", "Matin", "Sport"), active.map(HabitGroup::name))
    }

    @Test
    fun `active groups are ordered by their configured order`() {
        val active = HabitGroup.activeAt(listOf(evening, day, afternoon, morning), LocalTime.of(19, 0))

        assertEquals(listOf("Journée", "Soir"), active.map(HabitGroup::name))
    }

    @Test
    fun `an all day group remains active even when every range is idle`() {
        val quiet = HabitGroup("quiet", "Sieste", startMinute = 14 * 60, endMinute = 15 * 60, sortOrder = 4)

        assertEquals(listOf(day), HabitGroup.activeAt(listOf(day, quiet), LocalTime.of(3, 0)))
    }
}
