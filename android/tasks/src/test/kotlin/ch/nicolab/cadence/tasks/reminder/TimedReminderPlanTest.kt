package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.domain.ReminderLead
import ch.nicolab.cadence.tasks.model.RecurrenceRule
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TimedReminderPlanTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val now = at("2026-11-02T08:00:00")
    private val onTime = TimedReminders(enabled = true, lead = ReminderLead.AT_TIME)

    private fun at(local: String): Instant = LocalDateTime.parse(local).atZone(zone).toInstant()

    private fun timed(
        uid: String,
        due: String?,
        status: Int = TaskStatus.NOT_STARTED,
        reminderAt: Instant? = null,
        someday: Boolean = false,
        hasTime: Boolean = true,
        recurrence: String? = null,
        rule: RecurrenceRule = RecurrenceRule(),
        deferUntil: Instant? = null,
    ): TaskItem {
        val instant = due?.let { at(it) }
        return TaskItem(
            uid = uid,
            name = uid,
            status = status,
            dueDate = instant,
            dueDay = instant?.atZone(zone)?.toLocalDate(),
            dueHasTime = hasTime,
            reminderAt = reminderAt,
            someday = someday,
            recurrenceType = recurrence,
            recurrence = rule,
            deferUntil = deferUntil,
        )
    }

    private fun wanted(
        tasks: List<TaskItem>,
        settings: TimedReminders = onTime,
        delivered: Set<String> = emptySet(),
        quiet: QuietPolicy = QuietPolicy.NONE,
        at: Instant = now,
    ) = ReminderPlan.wanted(tasks, delivered, at, settings, quiet, zone)

    @Test
    fun `une tâche à heure fixe sans rappel explicite sonne à son heure`() {
        val result = wanted(listOf(timed("t", "2026-11-02T14:00:00"))).values.single()

        assertEquals("t", result.uid)
        assertEquals(at("2026-11-02T14:00:00"), result.marker)
        assertEquals(at("2026-11-02T14:00:00"), result.notifyAt)
    }

    @Test
    fun `l'avance choisie précède l'heure sans changer le repère`() {
        val result = wanted(listOf(timed("t", "2026-11-02T14:00:00")), TimedReminders(true, ReminderLead.FIFTEEN_MINUTES)).values.single()

        assertEquals(at("2026-11-02T14:00:00"), result.marker)
        assertEquals(at("2026-11-02T13:45:00"), result.notifyAt)
    }

    @Test
    fun `un rappel explicite l'emporte et il n'y a qu'une alarme`() {
        val explicit = at("2026-11-02T13:00:00")

        val result = wanted(listOf(timed("t", "2026-11-02T14:00:00", reminderAt = explicit))).values.single()

        assertEquals(explicit, result.marker)
        assertEquals(explicit, result.notifyAt)
    }

    @Test
    fun `le réglage coupé supprime les rappels à heure fixe, pas les explicites`() {
        val tasks = listOf(timed("t", "2026-11-02T14:00:00"), timed("e", "2026-11-02T14:00:00", reminderAt = at("2026-11-02T13:00:00")))

        assertEquals(setOf("e"), wanted(tasks, TimedReminders.OFF).values.mapTo(HashSet()) { it.uid })
    }

    @Test
    fun `une échéance sans heure, Plus tard, terminée ou annulée ne sonne jamais`() {
        val tasks = listOf(
            timed("jour", "2026-11-02T23:59:59", hasTime = false),
            timed("plus-tard", "2026-11-02T14:00:00", someday = true),
            timed("faite", "2026-11-02T14:00:00", status = TaskStatus.DONE),
            timed("annulee", "2026-11-02T14:00:00", status = TaskStatus.CANCELLED),
            timed("sans-echeance", null),
        )

        assertTrue(wanted(tasks).isEmpty())
    }

    @Test
    fun `une échéance avant la date de report ne sonne pas`() {
        val task = timed("t", "2026-11-02T14:00:00", deferUntil = at("2026-11-03T00:00:00"))

        assertTrue(wanted(listOf(task)).isEmpty())
    }

    @Test
    fun `seule l'échéance de l'horizon de 14 jours est posée`() {
        val tasks = listOf(timed("proche", "2026-11-12T09:00:00"), timed("lointaine", "2026-11-20T09:00:00"))

        assertEquals(setOf("proche"), wanted(tasks).values.mapTo(HashSet()) { it.uid })
    }

    @Test
    fun `une série quotidienne à heure fixe a une alarme par occurrence dans l'horizon`() {
        val daily = timed("serie", "2026-11-02T09:00:00", recurrence = "daily")

        val markers = wanted(listOf(daily)).values.map { it.marker }.sorted()

        assertEquals(at("2026-11-02T09:00:00"), markers.first())
        assertEquals(at("2026-11-15T09:00:00"), markers.last())
        assertEquals(14, markers.size)
        assertEquals(markers.size, wanted(listOf(daily)).keys.size)
    }

    @Test
    fun `une série hebdomadaire a ses occurrences à venir et respecte sa fin`() {
        val weekly = timed(
            "hebdo", "2026-11-02T18:30:00", recurrence = "weekly",
            rule = RecurrenceRule(weekdays = listOf(1), endDay = LocalDate.of(2026, 11, 9)),
        )

        assertEquals(
            listOf(at("2026-11-02T18:30:00"), at("2026-11-09T18:30:00")),
            wanted(listOf(weekly)).values.map { it.marker }.sorted(),
        )
    }

    @Test
    fun `une occurrence retirée de la série (exception) ne sonne pas`() {
        val daily = timed("serie", "2026-11-02T09:00:00", recurrence = "daily", rule = RecurrenceRule(exdates = setOf(LocalDate.of(2026, 11, 3))))

        val markers = wanted(listOf(daily)).values.map { it.marker }

        assertFalse(at("2026-11-03T09:00:00") in markers)
        assertTrue(at("2026-11-04T09:00:00") in markers)
    }

    @Test
    fun `une occurrence manquée depuis moins de 15 minutes sonne encore, une fois`() {
        val task = timed("t", "2026-11-02T07:50:00")
        val key = ReminderPlan.deliveryKey("t", at("2026-11-02T07:50:00"))

        assertEquals(1, wanted(listOf(task)).size)
        assertTrue(wanted(listOf(task), delivered = setOf(key)).isEmpty())
    }

    @Test
    fun `une échéance horaire passée depuis plus de 15 minutes ne sonne pas rétroactivement`() {
        assertTrue(wanted(listOf(timed("t", "2026-11-02T07:30:00"))).isEmpty())
        assertTrue(wanted(listOf(timed("hier", "2026-11-01T15:00:00"))).isEmpty())
    }

    @Test
    fun `une occurrence dans la plage silencieuse reste voulue jusqu'à la fin de la plage`() {
        val quiet = QuietPolicy(QuietHours(true, LocalTime.of(22, 0), LocalTime.of(7, 0)), zone)
        val task = timed("t", "2026-11-02T23:00:00")

        val plan = ReminderPlan.alarms(listOf(task), emptySet(), emptySet(), emptySet(), at("2026-11-03T02:00:00"), quiet, onTime, zone)

        assertEquals(at("2026-11-03T07:00:00"), plan.reminders.values.single().triggerAt)
    }

    @Test
    fun `le plan pose une alarme par occurrence et retire celles qui ne sont plus voulues`() {
        val daily = timed("serie", "2026-11-02T09:00:00", recurrence = "daily")
        val stale = ReminderPlan.alarmKey("serie", at("2026-10-31T09:00:00"))

        val plan = ReminderPlan.alarms(listOf(daily), emptySet(), setOf(stale), emptySet(), now, QuietPolicy.NONE, onTime, zone)

        assertEquals(14, plan.reminders.size)
        assertEquals(setOf(stale), plan.staleReminders)
    }

    @Test
    fun `un report d'une occurrence à heure fixe est gardé tant que l'occurrence existe`() {
        val daily = timed("serie", "2026-11-02T09:00:00", recurrence = "daily")
        val marker = at("2026-11-03T09:00:00")
        val snooze = TaskSnooze("serie", marker.toEpochMilli(), at("2026-11-02T08:10:00"))
        val other = TaskSnooze("serie", at("2026-11-03T09:30:00").toEpochMilli(), at("2026-11-02T08:10:00"))

        val plan = ReminderPlan.alarms(listOf(daily), emptySet(), emptySet(), setOf(snooze.encode(), other.encode()), now, QuietPolicy.NONE, onTime, zone)

        assertEquals(mapOf("serie" to snooze), plan.snoozes)
        assertEquals(setOf(other.encode()), plan.staleSnoozes)
    }

    @Test
    fun `un repère ne vaut plus quand la tâche est fermée, déplacée, ou reçoit un rappel explicite`() {
        val due = at("2026-11-02T14:00:00")
        val marker = due.toEpochMilli()

        assertTrue(ReminderPlan.isCurrentMarker(timed("t", "2026-11-02T14:00:00"), marker, onTime, now, zone))
        assertFalse(ReminderPlan.isCurrentMarker(timed("t", "2026-11-02T14:00:00", status = TaskStatus.DONE), marker, onTime, now, zone))
        assertFalse(ReminderPlan.isCurrentMarker(timed("t", "2026-11-02T15:00:00"), marker, onTime, now, zone))
        assertFalse(ReminderPlan.isCurrentMarker(timed("t", "2026-11-02T14:00:00"), marker, TimedReminders.OFF, now, zone))
        assertFalse(ReminderPlan.isCurrentMarker(timed("t", "2026-11-02T14:00:00", reminderAt = at("2026-11-02T13:00:00")), marker, onTime, now, zone))
        assertFalse(ReminderPlan.isCurrentMarker(null, marker, onTime, now, zone))
    }
}
