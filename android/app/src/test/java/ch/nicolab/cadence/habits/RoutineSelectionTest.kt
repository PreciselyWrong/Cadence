package ch.nicolab.cadence.habits

import ch.nicolab.cadence.domain.HabitGroup
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class RoutineSelectionTest {
    private val allDay = HabitGroup(HabitGroup.ALL_DAY_ID, "Journée", null, null, 0)
    private val morning = HabitGroup("group-morning", "Matin", 5 * 60, 12 * 60, 1)
    private val evening = HabitGroup("group-evening", "Soir", 22 * 60, 2 * 60, 3)
    private val groups = listOf(allDay, morning, evening)

    private fun candidate(id: String, groupId: String, due: Boolean = true, done: Boolean = false, partial: Boolean = false) =
        RoutineCandidate(id, groupId, due, done, partial)

    @Test
    fun `counts only the due habits of the timed group that contains now`() {
        val moment = selectRoutine(
            groups,
            listOf(
                candidate("eau", "group-morning", done = true),
                candidate("lire", "group-morning", partial = true),
                candidate("etirer", "group-morning"),
                candidate("soiree", "group-evening"),
                candidate("hors-planning", "group-morning", due = false),
            ),
            LocalTime.of(8, 0),
        )!!

        assertEquals("group-morning", moment.group.id)
        assertEquals(1, moment.done)
        assertEquals(3, moment.due)
        assertEquals(1, moment.partial)
        assertEquals(listOf("eau", "lire", "etirer"), moment.facetIds)
    }

    @Test
    fun `a window that crosses midnight contains the hours after midnight`() {
        val moment = selectRoutine(groups, listOf(candidate("tisane", "group-evening")), LocalTime.of(1, 30))!!

        assertEquals("group-evening", moment.group.id)
    }

    @Test
    fun `falls back to the all-day group outside every timed window`() {
        val moment = selectRoutine(
            groups,
            listOf(candidate("vitamine", HabitGroup.ALL_DAY_ID), candidate("eau", "group-morning")),
            LocalTime.of(15, 0),
        )!!

        assertEquals(HabitGroup.ALL_DAY_ID, moment.group.id)
        assertEquals(listOf("vitamine"), moment.facetIds)
    }

    @Test
    fun `returns no moment when nothing is due in the current group`() {
        val moment = selectRoutine(
            groups,
            listOf(candidate("eau", "group-morning", due = false), candidate("lire", "group-evening")),
            LocalTime.of(8, 0),
        )

        assertNull(moment)
    }

    @Test
    fun `shows at most five facets in habit order`() {
        val habits = (1..7).map { candidate("h$it", "group-morning") }

        val moment = selectRoutine(groups, habits, LocalTime.of(8, 0))!!

        assertEquals(7, moment.due)
        assertEquals(listOf("h1", "h2", "h3", "h4", "h5"), moment.facetIds)
    }

    @Test
    fun `overlapping timed groups resolve to the first one in sort order`() {
        val afternoon = HabitGroup("group-afternoon", "Après-midi", 10 * 60, 18 * 60, 2)
        val moment = selectRoutine(
            listOf(allDay, afternoon, morning),
            listOf(candidate("eau", "group-morning"), candidate("marche", "group-afternoon")),
            LocalTime.of(11, 0),
        )!!

        assertEquals("group-morning", moment.group.id)
    }
}
