package ch.nicolab.cadence.tasks.proposals

import java.time.LocalDate
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MorningRitualTest {
    private val today = LocalDate.of(2026, 11, 19)
    private val tomorrow = today.plusDays(1)
    private val yesterday = today.minusDays(1)

    private fun sampleJson(
        trigger: String? = "morning",
        focusJson: String = """["t1","t3","unknown","t1","t4"]""",
    ): String {
        val triggerField = trigger?.let { """"trigger": "$it",""" } ?: ""
        return """
            {
              "uid": "p-morning",
              "kind": "week",
              "status": "ready",
              $triggerField
              "period_start": "2026-11-19",
              "period_end": "2026-11-25",
              "answer": {
                "headline": "3 retards à trier.",
                "focus": $focusJson,
                "changes": [
                  { "task_uid": "t1", "op": "plan_day", "date": "2026-11-19", "reason": "Prioritaire aujourd'hui" },
                  { "task_uid": "t2", "op": "plan_day", "date": "2026-11-20", "reason": "Demain matin plus calme" }
                ]
              },
              "days": [
                {
                  "date": "2026-11-19",
                  "load_minutes": 45,
                  "capacity_minutes": 180,
                  "items": [
                    { "task_uid": "t4", "name": "Revue hebdo", "minutes": 45 }
                  ],
                  "events": [
                    { "title": "Point équipe", "start": "14:00", "end": "14:30", "all_day": false },
                    { "title": "Médecin", "start": "09:30", "end": "10:15", "all_day": false },
                    { "title": "Congé école", "all_day": true }
                  ],
                  "work": { "start": "09:00", "end": "12:30", "label": "Bureau" }
                },
                {
                  "date": "2026-11-20",
                  "load_minutes": 30,
                  "capacity_minutes": 480,
                  "items": [],
                  "events": []
                }
              ],
              "facts": {
                "today": "2026-11-19",
                "tasks": [
                  { "uid": "t1", "name": "Envoyer le dossier", "due": "2026-11-18", "overdue": true, "project": "Admin", "estimate_min": 30 },
                  { "uid": "t2", "name": "Appeler le plombier", "due": "2026-11-15", "overdue": true, "estimate_min": 15 },
                  { "uid": "t3", "name": "Relire le contrat", "due": "2026-11-17", "overdue": true, "project": "Travail", "estimate_min": 60 },
                  { "uid": "t4", "name": "Revue hebdo", "due": "2026-11-19", "overdue": false, "estimate_min": 45 }
                ]
              }
            }
        """.trimIndent()
    }

    @Test
    fun `parses trigger and focus tolerantly with defaults`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(sampleJson())
        assertEquals("morning", dto.trigger)
        assertEquals(listOf("t1", "t3", "unknown", "t1", "t4"), dto.answer?.focus)

        val plain = ProposalJson.decodeFromString<ProposalDto>(sampleJson(trigger = null, focusJson = "[]"))
        assertNull(plain.trigger)
        assertEquals(emptyList<String>(), plain.answer?.focus)

        val withoutFocus = ProposalJson.decodeFromString<ProposalDto>(
            """{"uid":"p2","kind":"week","status":"ready","answer":{"headline":"Ok","unknown_field":42}}""",
        )
        assertNull(withoutFocus.trigger)
        assertEquals(emptyList<String>(), withoutFocus.answer?.focus)
    }

    @Test
    fun `step 1 cards only include overdue tasks ordered oldest lateness first`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(sampleJson())
        val cards = MorningRitual.cards(dto, today)

        assertEquals(listOf("t2", "t3", "t1"), cards.map { it.task.uid })
        assertEquals(listOf(4, 2, 1), cards.map { it.latenessDays })
        assertEquals("Admin", cards[2].task.project)
        assertEquals(30, cards[2].task.estimateMin)
    }

    @Test
    fun `default choice is agent change when present, else today`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(sampleJson())
        val cards = MorningRitual.cards(dto, today).associateBy { it.task.uid }

        // t1: agent proposed plan_day today
        assertTrue(cards.getValue("t1").hasAdvice)
        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, today), cards.getValue("t1").defaultChoice)

        // t2: agent proposed plan_day tomorrow
        assertTrue(cards.getValue("t2").hasAdvice)
        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, tomorrow), cards.getValue("t2").defaultChoice)

        // t3: no agent advice -> neutral today
        assertFalse(cards.getValue("t3").hasAdvice)
        assertNull(cards.getValue("t3").advice)
        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, today), cards.getValue("t3").defaultChoice)
    }

    @Test
    fun `swipe mapping right is advice, left is tomorrow, up is later`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(sampleJson())
        val cards = MorningRitual.cards(dto, today).associateBy { it.task.uid }
        val t2 = cards.getValue("t2")
        val t3 = cards.getValue("t3")

        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, tomorrow), MorningRitual.swipeChoice(RitualSwipe.RIGHT, t2, today))
        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, today), MorningRitual.swipeChoice(RitualSwipe.RIGHT, t3, today))
        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, tomorrow), MorningRitual.swipeChoice(RitualSwipe.LEFT, t3, today))
        assertEquals(WeekDecision(ProposalOp.LATER), MorningRitual.swipeChoice(RitualSwipe.UP, t2, today))
    }

    @Test
    fun `step 2 day puts focus first, then events in time order, then tasks, and computes load`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(sampleJson())
        val focus = MorningRitual.initialFocus(dto)
        // t1, t3, t4 are known tasks; "unknown" dropped; max 3
        assertEquals(setOf("t1", "t3", "t4"), focus)

        // User puts t1 on today, t2 on tomorrow, t3 on later (so t3 is NOT planned today -> excluded from focus!)
        val chosen = mapOf(
            "t1" to WeekDecision(ProposalOp.PLAN_DAY, today),
            "t2" to WeekDecision(ProposalOp.PLAN_DAY, tomorrow),
            "t3" to WeekDecision(ProposalOp.LATER),
        )
        val plan = MorningRitual.dayPlan(dto, today, chosen, focus)

        // Focus: t4 (on today's plan) and t1 (put on today); t3 is NOT on today so hidden from focus
        assertEquals(listOf("t4", "t1"), plan.focus.map { it.taskUid })

        // Timeline: all-day event first, then 09:30, then 14:00 (no non-focus tasks left for today)
        assertEquals(3, plan.timeline.size)
        val eventTitles = plan.timeline.filterIsInstance<MorningTimelineEntry.Event>().map { it.title }
        assertEquals(listOf("Congé école", "Médecin", "Point équipe"), eventTitles)

        // Load: t4 (45m) + t1 (30m) = 75m against 180m capacity -> 105m free, not overloaded
        assertEquals(75, plan.plannedMinutes)
        assertEquals(180, plan.capacityMinutes)
        assertEquals(105, plan.freeMinutes)
        assertFalse(plan.overloaded)
    }

    @Test
    fun `step 2 day marks overloaded when planned minutes exceed working capacity and includes non-focus tasks`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(sampleJson())
        val focus = setOf("t1")
        // t1 (30m, focus), t3 (60m, non-focus, today), t4 (45m, non-focus, today), t2 (15m, non-focus, today) -> 150m vs 180m
        // Add t3 + t2 + t1 = 105 + 45 = 150; let's test toggleFocus & overload with 120 capacity
        val smallCap = dto.copy(
            days = dto.days?.map { if (it.date == "2026-11-19") it.copy(capacityMinutes = 90) else it },
        )
        val chosen = mapOf(
            "t1" to WeekDecision(ProposalOp.PLAN_DAY, today),
            "t3" to WeekDecision(ProposalOp.PLAN_DAY, today),
        )
        val plan = MorningRitual.dayPlan(smallCap, today, chosen, focus)

        assertEquals(listOf("t1"), plan.focus.map { it.taskUid })
        val taskEntries = plan.timeline.filterIsInstance<MorningTimelineEntry.Task>().map { it.item.taskUid }
        assertEquals(listOf("t4", "t3"), taskEntries)
        assertEquals(135, plan.plannedMinutes)
        assertEquals(90, plan.capacityMinutes)
        assertEquals(0, plan.freeMinutes)
        assertTrue(plan.overloaded)
    }

    @Test
    fun `apply body includes only shown tasks with non-keep decisions and omits untouched tasks`() {
        val shown = setOf("t1", "t2", "t3")
        val chosen = mapOf(
            "t1" to WeekDecision(ProposalOp.PLAN_DAY, today),
            "t2" to WeekDecision(ProposalOp.LATER),
            // t3 untouched (not in chosen)
            // t4 not shown in ritual (should not be sent even if somehow in chosen, unless shown)
            "t4" to WeekDecision(ProposalOp.DONE),
        )
        val body = MorningRitual.applyBody(shown, chosen)
        val decisions = body["decisions"]!!.jsonArray
        assertEquals(2, decisions.size)

        val d0 = decisions[0].jsonObject
        assertEquals("t1", d0["task_uid"]!!.jsonPrimitive.content)
        assertEquals("plan_day", d0["op"]!!.jsonPrimitive.content)
        assertEquals("2026-11-19", d0["date"]!!.jsonPrimitive.content)

        val d1 = decisions[1].jsonObject
        assertEquals("t2", d1["task_uid"]!!.jsonPrimitive.content)
        assertEquals("later", d1["op"]!!.jsonPrimitive.content)
        assertNull(d1["date"])
    }

    @Test
    fun `apply body drops keep decisions and supports all ritual ops`() {
        val shown = setOf("a", "b", "c", "d", "e")
        val chosen = mapOf(
            "a" to WeekDecision(ProposalOp.THIS_WEEK),
            "b" to WeekDecision(ProposalOp.DONE),
            "c" to WeekDecision(ProposalOp.DROP),
            "d" to WeekDecision(ProposalOp.KEEP),
            "e" to WeekDecision(ProposalOp.PLAN_DAY, today.plusDays(3)),
        )
        val body = MorningRitual.applyBody(shown, chosen)
        val decisions = body["decisions"]!!.jsonArray
        assertEquals(4, decisions.size)
        assertEquals(listOf("a", "b", "c", "e"), decisions.map { it.jsonObject["task_uid"]!!.jsonPrimitive.content })
    }

    @Test
    fun `isReadyForToday checks kind, status, morning trigger, and today date`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(sampleJson())
        assertTrue(MorningRitual.isReadyForToday(dto, today))
        assertFalse(MorningRitual.isReadyForToday(dto, yesterday))
        assertFalse(MorningRitual.isReadyForToday(dto.copy(status = "applied"), today))
        assertFalse(MorningRitual.isReadyForToday(dto.copy(trigger = null), today))
    }
}
