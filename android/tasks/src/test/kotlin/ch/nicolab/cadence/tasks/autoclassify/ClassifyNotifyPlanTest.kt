package ch.nicolab.cadence.tasks.autoclassify

import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.QuietPolicy
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ClassifyNotifyPlanTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val night = QuietPolicy(QuietHours(true, LocalTime.of(22, 0), LocalTime.of(7, 0)), zone)
    private val none = QuietPolicy.NONE

    private fun at(hour: Int) = ZonedDateTime.of(LocalDateTime.of(2026, 11, 7, hour, 30), zone).toInstant()

    private val pending = listOf(
        PendingSuggestion("s1", "classify", "task", "t1", null),
        PendingSuggestion("s2", "duplicate", "link", "l2", null),
    )

    @Test
    fun onlyTheSuggestionsNotNotifiedYetAreDue() {
        val due = ClassifyNotifyPlan.due(pending, notified = setOf("s1"), notify = true, now = at(12), quiet = none)

        assertEquals(listOf("s2"), due.map { it.uid })
    }

    @Test
    fun nothingIsDueWhenTheUserTurnedNotificationsOff() {
        assertTrue(ClassifyNotifyPlan.due(pending, emptySet(), notify = false, now = at(12), quiet = none).isEmpty())
    }

    @Test
    fun nothingIsDueDuringQuietHoursAndTheNextPassTakesThemAfterwards() {
        assertTrue(ClassifyNotifyPlan.due(pending, emptySet(), notify = true, now = at(23), quiet = night).isEmpty())
        assertEquals(2, ClassifyNotifyPlan.due(pending, emptySet(), notify = true, now = at(8), quiet = night).size)
    }

    @Test
    fun theMemoryForgetsWhatIsNoLongerPending() {
        val remembered = ClassifyNotifyPlan.remembered(pendingUids = setOf("s1"), notified = setOf("s1", "s0", "s9"))

        assertEquals(setOf("s1"), remembered)
    }
}
