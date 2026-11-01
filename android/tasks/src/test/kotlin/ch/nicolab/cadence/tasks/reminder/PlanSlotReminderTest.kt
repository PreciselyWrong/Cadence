package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.domain.ReminderLead
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Une tâche placée à une heure dans le plan du jour sonne à cette heure, comme une tâche à heure fixe. */
class PlanSlotReminderTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val now = Instant.parse("2026-11-01T09:00:00Z")
    private val at1630 = Instant.parse("2026-11-01T15:30:00Z")
    private val coffee = TaskItem(uid = "t283", name = "Entretien machine à café")
    private val timed = TimedReminders()

    private val response = Json.parseToJsonElement(
        """
        {"date":"2026-11-01","plan":{"date":"2026-11-01","items":[
          {"task_uid":"t283","position":0,"start_minute":990,"duration_minutes":30,"occurrence_done":false},
          {"task_uid":"untimed","position":1,"start_minute":null,"duration_minutes":30,"occurrence_done":false},
          {"task_uid":"done-occ","position":2,"start_minute":600,"duration_minutes":30,"occurrence_done":true}
        ]}}
        """.trimIndent(),
    ).jsonObject

    @Test
    fun `lit les placements à heure du plan, dans le fuseau du jour`() {
        assertEquals(listOf(PlanSlot("t283", at1630)), PlanSlots.parse(response, zone))
        assertEquals(emptyList<PlanSlot>(), PlanSlots.parse(Json.parseToJsonElement("""{"plan":null}""").jsonObject, zone))
    }

    @Test
    fun `une tâche sans heure placée à 16 h 30 sonne à 16 h 30, une fois`() {
        val wanted = ReminderPlan.wanted(listOf(coffee), emptySet(), now, timed, QuietPolicy.NONE, zone, listOf(PlanSlot("t283", at1630)))

        assertEquals(listOf(ReminderPlan.Wanted("t283", at1630, at1630)), wanted.values.toList())
    }

    @Test
    fun `l'avance des tâches à heure fixe s'applique au placement`() {
        val early = TimedReminders(lead = ReminderLead.ofMinutes(10, ReminderLead.AT_TIME))
        val wanted = ReminderPlan.wanted(listOf(coffee), emptySet(), now, early, QuietPolicy.NONE, zone, listOf(PlanSlot("t283", at1630)))

        assertEquals(at1630.minusSeconds(600), wanted.values.single().notifyAt)
    }

    @Test
    fun `rien pour une tâche faite, Plus tard, réglage coupé ou placement retiré`() {
        val slot = listOf(PlanSlot("t283", at1630))
        val done = coffee.copy(status = TaskStatus.DONE)
        val later = coffee.copy(someday = true)

        assertTrue(ReminderPlan.wanted(listOf(done), emptySet(), now, timed, QuietPolicy.NONE, zone, slot).isEmpty())
        assertTrue(ReminderPlan.wanted(listOf(later), emptySet(), now, timed, QuietPolicy.NONE, zone, slot).isEmpty())
        assertTrue(ReminderPlan.wanted(listOf(coffee), emptySet(), now, TimedReminders.OFF, QuietPolicy.NONE, zone, slot).isEmpty())
        assertTrue(ReminderPlan.wanted(listOf(coffee), emptySet(), now, timed, QuietPolicy.NONE, zone, emptyList()).isEmpty())
    }

    @Test
    fun `un placement déplacé retire l'ancienne alarme et pose la nouvelle`() {
        val oldKey = ReminderPlan.alarmKey("t283", at1630)
        val moved = at1630.plusSeconds(3600)
        val plan = ReminderPlan.alarms(
            listOf(coffee), emptySet(), setOf(oldKey), emptySet(), now, QuietPolicy.NONE, timed, zone, listOf(PlanSlot("t283", moved)),
        )

        assertEquals(setOf(oldKey), plan.staleReminders)
        assertEquals(setOf(ReminderPlan.alarmKey("t283", moved)), plan.reminders.keys)
    }

    @Test
    fun `le repère d'un placement reste valable pour la notification`() {
        val slots = listOf(PlanSlot("t283", at1630))
        assertTrue(ReminderPlan.isCurrentMarker(coffee, at1630.toEpochMilli(), timed, now, zone, slots))
        assertFalse(ReminderPlan.isCurrentMarker(coffee, at1630.toEpochMilli(), timed, now, zone, emptyList()))
    }

    @Test
    fun `les placements gardés sur l'appareil se relisent tels quels`() {
        val slots = listOf(PlanSlot("t283", at1630), PlanSlot("x", now))
        assertEquals(slots.toSet(), PlanSlots.decode(PlanSlots.encode(slots)).toSet())
    }
}
