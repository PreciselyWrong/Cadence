package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.domain.SnoozeDelay
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReminderAlarmPlanTest {
    private val zurich = ZoneId.of("Europe/Zurich")
    private val quiet = QuietPolicy(QuietHours(true, LocalTime.of(22, 0), LocalTime.of(7, 0)), zurich)

    private fun at(local: String): Instant = LocalDateTime.parse(local).atZone(zurich).toInstant()

    private fun task(uid: String, reminderAt: Instant?, status: Int = TaskStatus.NOT_STARTED) =
        TaskItem(uid = uid, name = uid, status = status, reminderAt = reminderAt)

    @Test
    fun `un rappel dans la plage silencieuse sonne à la fin de la plage`() {
        val now = at("2026-11-02T20:00:00")
        val reminder = at("2026-11-02T23:00:00")

        val plan = ReminderPlan.alarms(listOf(task("t", reminder)), emptySet(), emptySet(), emptySet(), now, quiet)

        val alarm = plan.reminders.getValue("t")
        assertEquals(reminder, alarm.reminderAt)
        assertEquals(at("2026-11-03T07:00:00"), alarm.triggerAt)
    }

    @Test
    fun `un rappel hors de la plage garde son heure`() {
        val now = at("2026-11-02T08:00:00")
        val reminder = at("2026-11-02T18:00:00")

        val plan = ReminderPlan.alarms(listOf(task("t", reminder)), emptySet(), emptySet(), emptySet(), now, quiet)

        assertEquals(reminder, plan.reminders.getValue("t").triggerAt)
    }

    @Test
    fun `un rappel passé pendant la plage reste posé jusqu'à sa fin`() {
        val now = at("2026-11-03T02:00:00")
        val reminder = at("2026-11-02T23:00:00")

        val plan = ReminderPlan.alarms(listOf(task("t", reminder)), emptySet(), emptySet(), emptySet(), now, quiet)

        assertEquals(at("2026-11-03T07:00:00"), plan.reminders.getValue("t").triggerAt)
    }

    @Test
    fun `les alarmes posées dont le rappel n'est plus voulu sont à retirer`() {
        val now = at("2026-11-02T08:00:00")
        val tasks = listOf(task("garde", at("2026-11-02T18:00:00")), task("fermee", at("2026-11-02T18:00:00"), TaskStatus.DONE))

        val plan = ReminderPlan.alarms(tasks, emptySet(), setOf("garde", "fermee", "disparue"), emptySet(), now, QuietPolicy.NONE)

        assertEquals(setOf("fermee", "disparue"), plan.staleReminders)
    }

    @Test
    fun `un report vaut 10 minutes ou 1 heure et sort de la plage silencieuse`() {
        val now = at("2026-11-02T12:00:00")

        assertEquals(at("2026-11-02T12:10:00"), SnoozeDelay.TEN_MINUTES.triggerAt(now, quiet))
        assertEquals(at("2026-11-02T13:00:00"), SnoozeDelay.ONE_HOUR.triggerAt(now, quiet))
        assertEquals(at("2026-11-03T07:00:00"), SnoozeDelay.ONE_HOUR.triggerAt(at("2026-11-02T21:30:00"), quiet))
    }

    @Test
    fun `un report enregistré se relit tel quel et ignore les lignes illisibles`() {
        val snooze = TaskSnooze("t", 1000L, Instant.ofEpochMilli(5000L))

        assertEquals(snooze, TaskSnooze.decode(snooze.encode()))
        assertNull(TaskSnooze.decode("n'importe quoi"))
        assertNull(TaskSnooze.decode("t|x|5000"))
    }

    @Test
    fun `un report à venir est reposé même si le rappel d'origine est déjà remis`() {
        val now = at("2026-11-02T12:00:00")
        val reminder = at("2026-11-02T11:55:00")
        val snooze = TaskSnooze("t", reminder.toEpochMilli(), at("2026-11-02T12:05:00"))
        val delivered = setOf(ReminderPlan.deliveryKey("t", reminder))

        val plan = ReminderPlan.alarms(listOf(task("t", reminder)), delivered, emptySet(), setOf(snooze.encode()), now, QuietPolicy.NONE)

        assertEquals(mapOf("t" to snooze), plan.snoozes)
        assertTrue(plan.reminders.isEmpty())
        assertTrue(plan.staleSnoozes.isEmpty())
    }

    @Test
    fun `un report est abandonné si la tâche est fermée, supprimée ou son rappel déplacé`() {
        val now = at("2026-11-02T12:00:00")
        val reminder = at("2026-11-02T11:55:00")
        val later = at("2026-11-02T12:05:00")
        val tasks = listOf(
            task("fermee", reminder, TaskStatus.DONE),
            task("deplacee", reminder.plusSeconds(3600)),
        )
        val stored = setOf("fermee", "deplacee", "supprimee").map { TaskSnooze(it, reminder.toEpochMilli(), later).encode() }.toSet()

        val plan = ReminderPlan.alarms(tasks, emptySet(), emptySet(), stored, now, QuietPolicy.NONE)

        assertTrue(plan.snoozes.isEmpty())
        assertEquals(stored, plan.staleSnoozes)
    }

    @Test
    fun `un report plus ancien que la fenêtre de rattrapage est abandonné`() {
        val now = at("2026-11-04T12:00:00")
        val reminder = at("2026-11-02T11:55:00")
        val snooze = TaskSnooze("t", reminder.toEpochMilli(), at("2026-11-02T12:05:00"))

        val plan = ReminderPlan.alarms(listOf(task("t", reminder)), emptySet(), emptySet(), setOf(snooze.encode()), now, QuietPolicy.NONE)

        assertTrue(plan.snoozes.isEmpty())
        assertEquals(setOf(snooze.encode()), plan.staleSnoozes)
    }

    @Test
    fun `poser un report remplace celui de la même tâche`() {
        val first = TaskSnooze("t", 1L, Instant.ofEpochMilli(10)).encode()
        val other = TaskSnooze("autre", 1L, Instant.ofEpochMilli(10)).encode()
        val second = TaskSnooze("t", 1L, Instant.ofEpochMilli(20))

        assertEquals(setOf(other, second.encode()), TaskSnooze.replacing(setOf(first, other), second))
        assertEquals(setOf(other), TaskSnooze.without(setOf(first, other), "t"))
    }
}
