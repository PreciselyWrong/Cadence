package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskSnoozeRulesTest {
    private val zurich = ZoneId.of("Europe/Zurich")
    private val quiet = QuietPolicy(QuietHours(true, LocalTime.of(22, 0), LocalTime.of(7, 0)), zurich)
    private val noQuiet = QuietPolicy.NONE

    private fun at(local: String): Instant = LocalDateTime.parse(local).atZone(zurich).toInstant()

    private fun timed(due: String?, estimated: Int?) =
        TaskItem(uid = "t", name = "t", dueDate = due?.let { at(it) }, dueHasTime = due != null, estimatedMinutes = estimated)

    @Test
    fun `10 minutes sortent de la plage silencieuse comme avant`() {
        val now = at("2026-11-02T12:00:00")

        assertEquals(at("2026-11-02T12:10:00"), TaskSnoozeRules.triggerAt(TaskSnoozeChoice.TEN_MINUTES, timed(null, null), now, zurich, noQuiet))
        assertEquals(at("2026-11-03T07:00:00"), TaskSnoozeRules.triggerAt(TaskSnoozeChoice.TEN_MINUTES, timed(null, null), at("2026-11-02T21:55:00"), zurich, quiet))
    }

    @Test
    fun `demain reprend la même heure le jour suivant, en gardant l'heure locale d'un changement d'heure`() {
        assertEquals(at("2026-11-03T09:30:00"), TaskSnoozeRules.triggerAt(TaskSnoozeChoice.TOMORROW, timed(null, null), at("2026-11-02T09:30:00"), zurich, noQuiet))
        assertEquals(at("2026-03-29T09:00:00"), TaskSnoozeRules.triggerAt(TaskSnoozeChoice.TOMORROW, timed(null, null), at("2026-03-28T09:00:00"), zurich, noQuiet))
    }

    @Test
    fun `demain tombant dans la plage silencieuse attend sa fin`() {
        val now = at("2026-11-02T23:00:00")

        assertEquals(at("2026-11-04T07:00:00"), TaskSnoozeRules.triggerAt(TaskSnoozeChoice.TOMORROW, timed(null, null), now, zurich, quiet))
    }

    @Test
    fun `à la fin vaut l'échéance plus la durée estimée`() {
        val task = timed("2026-11-02T14:00:00", 45)

        assertEquals(at("2026-11-02T14:45:00"), TaskSnoozeRules.triggerAt(TaskSnoozeChoice.UNTIL_END, task, at("2026-11-02T13:55:00"), zurich, noQuiet))
    }

    @Test
    fun `à la fin est absent sans heure, sans durée ou à moins de 5 minutes de la fin`() {
        val now = at("2026-11-02T13:55:00")

        assertNull(TaskSnoozeRules.endOf(timed(null, 45), now))
        assertNull(TaskSnoozeRules.endOf(timed("2026-11-02T14:00:00", null), now))
        assertNull(TaskSnoozeRules.endOf(timed("2026-11-02T14:00:00", 0), now))
        assertNull(TaskSnoozeRules.endOf(timed("2026-11-02T14:00:00", 10), at("2026-11-02T14:06:00")))
        assertNull(TaskSnoozeRules.triggerAt(TaskSnoozeChoice.UNTIL_END, timed("2026-11-02T14:00:00", 10), at("2026-11-02T14:06:00"), zurich, noQuiet))
    }

    @Test
    fun `à la fin tombant dans la plage silencieuse attend sa fin`() {
        val task = timed("2026-11-02T21:30:00", 60)

        assertEquals(at("2026-11-03T07:00:00"), TaskSnoozeRules.triggerAt(TaskSnoozeChoice.UNTIL_END, task, at("2026-11-02T21:00:00"), zurich, quiet))
    }

    @Test
    fun `la notification propose à la fin à la place de 10 minutes quand la tâche le permet, puis demain`() {
        val now = at("2026-11-02T13:55:00")

        assertEquals(listOf(TaskSnoozeChoice.UNTIL_END, TaskSnoozeChoice.TOMORROW), TaskSnoozeRules.offered(timed("2026-11-02T14:00:00", 45), now))
        assertEquals(listOf(TaskSnoozeChoice.TEN_MINUTES, TaskSnoozeChoice.TOMORROW), TaskSnoozeRules.offered(timed(null, null), now))
    }
}
