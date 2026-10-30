package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReminderPlanTest {
    private val now: Instant = Instant.parse("2026-10-30T09:00:00Z")

    private fun task(
        uid: String,
        reminderAt: Instant? = null,
        status: Int = TaskStatus.NOT_STARTED,
        dueDate: Instant? = null,
    ) = TaskItem(uid = uid, name = uid, status = status, reminderAt = reminderAt, dueDate = dueDate)

    @Test
    fun `pose les rappels à venir dans les 14 jours seulement`() {
        val tasks = listOf(
            task("proche", reminderAt = now.plusSeconds(3600)),
            task("lointain", reminderAt = now.plusSeconds(15L * 86_400)),
            task("sans-rappel"),
        )

        assertEquals(setOf("proche"), ReminderPlan.wanted(tasks, emptySet(), now).keys)
    }

    @Test
    fun `garde un rappel passé mais non remis, dans la fenêtre de 24 h`() {
        val late = task("en-retard", reminderAt = now.minusSeconds(3 * 3600))

        assertEquals(setOf("en-retard"), ReminderPlan.wanted(listOf(late), emptySet(), now).keys)
    }

    @Test
    fun `n'a plus de rappel passé une fois remis ou au-delà de 24 h`() {
        val at = now.minusSeconds(3 * 3600)
        val delivered = setOf(ReminderPlan.deliveryKey("remis", at))
        val remis = task("remis", reminderAt = at)
        val ancien = task("ancien", reminderAt = now.minusSeconds(25 * 3600))

        assertEquals(emptySet<String>(), ReminderPlan.wanted(listOf(remis, ancien), delivered, now).keys)
    }

    @Test
    fun `ignore les tâches fermées`() {
        val tasks = listOf(
            task("terminee", reminderAt = now.plusSeconds(3600), status = TaskStatus.DONE),
            task("annulee", reminderAt = now.plusSeconds(3600), status = TaskStatus.CANCELLED),
        )

        assertEquals(emptySet<String>(), ReminderPlan.wanted(tasks, emptySet(), now).keys)
    }

    @Test
    fun `purge les remises de plus de 24 h`() {
        val recent = ReminderPlan.deliveryKey("recent", now.minusSeconds(3600))
        val old = ReminderPlan.deliveryKey("ancien", now.minusSeconds(30 * 3600))

        assertEquals(setOf(recent), ReminderPlan.pruneDelivered(setOf(recent, old), now))
    }

    @Test
    fun `une occurrence est la même tant que l'échéance ne change pas`() {
        val due = Instant.parse("2026-10-30T18:00:00Z")
        val occurrence = ReminderPlan.occurrenceOf(due)

        assertTrue(ReminderPlan.isSameOccurrence(task("t", dueDate = due), occurrence))
        assertFalse(ReminderPlan.isSameOccurrence(task("t", dueDate = due.plusSeconds(86_400)), occurrence))
    }

    @Test
    fun `une tâche fermée ou absente n'est jamais la même occurrence`() {
        val due = Instant.parse("2026-10-30T18:00:00Z")
        val occurrence = ReminderPlan.occurrenceOf(due)

        assertFalse(ReminderPlan.isSameOccurrence(null, occurrence))
        assertFalse(ReminderPlan.isSameOccurrence(task("t", dueDate = due, status = TaskStatus.DONE), occurrence))
    }

    @Test
    fun `une tâche sans échéance reste reconnaissable comme occurrence`() {
        assertTrue(ReminderPlan.isSameOccurrence(task("t"), ReminderPlan.occurrenceOf(null)))
    }

    @Test
    fun `annule les notifications dont la tâche est fermée, supprimée ou déplacée`() {
        val reminder = now.plusSeconds(3600)
        val current = task("ouverte", reminderAt = reminder)
        val posted = setOf(
            ReminderPlan.signature(current),
            ReminderPlan.signature(task("fermee", reminderAt = reminder)),
            ReminderPlan.signature(task("supprimee", reminderAt = reminder)),
            ReminderPlan.signature(task("deplacee", reminderAt = reminder)),
        )
        val tasks = listOf(
            current,
            task("fermee", reminderAt = reminder, status = TaskStatus.DONE),
            task("deplacee", reminderAt = reminder.plusSeconds(60)),
        )

        val stale = ReminderPlan.staleNotifications(posted, tasks)

        assertEquals(
            setOf(
                ReminderPlan.signature(task("fermee", reminderAt = reminder)),
                ReminderPlan.signature(task("supprimee", reminderAt = reminder)),
                ReminderPlan.signature(task("deplacee", reminderAt = reminder)),
            ),
            stale,
        )
    }
}
