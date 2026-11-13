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

class ProposalModelTest {
    private val monday = LocalDate.of(2026, 11, 16)
    private val tuesday = monday.plusDays(1)
    private val wednesday = monday.plusDays(2)

    private fun change(uid: String, op: ProposalOp, date: LocalDate? = null) = WeekChange(uid, op, date, reason = "raison $uid")

    private fun task(uid: String, due: LocalDate? = null, overdue: Boolean = false) = FactTask(uid, "Tâche $uid", due, overdue)

    private fun tasksOf(vararg tasks: FactTask): Map<String, FactTask> = tasks.associateBy { it.uid }

    /** Réponse exacte du contrat `docs/47-proposals.md`, telle que `GET /api/proposals/:uid` la renvoie. */
    private val weekJson = """
        {
          "uid": "p1", "kind": "week", "status": "ready",
          "period_start": "2026-11-16", "period_end": "2026-11-22",
          "answer": {
            "summary": "Mardi est libre ; deux retards replacés.",
            "questions": [{ "id": "q1", "text": "Tu travailles mardi ?", "choices": ["Oui", "Non"] }],
            "changes": [
              { "task_uid": "abc123", "op": "plan_day", "date": "2026-11-17", "reason": "Mardi est libre" },
              { "task_uid": "def456", "op": "later", "reason": "Pas cette semaine" }
            ]
          },
          "facts": {
            "period": { "start": "2026-11-16", "end": "2026-11-22" },
            "today": "2026-11-16",
            "days": [],
            "tasks": [{ "uid": "abc123", "name": "Valider le devis", "due": "2026-11-17", "project": "Cuisine", "priority": "high" }],
            "stamps": { "abc123": "2026-11-10T08:00:00Z" }
          }
        }
    """.trimIndent()

    @Test
    fun `parses the documented week answer, its facts and its days`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(weekJson)

        assertEquals("ready", dto.status)
        assertEquals("Mardi est libre ; deux retards replacés.", dto.answer?.summary)
        assertEquals("Tu travailles mardi ?", dto.answer?.questions?.single()?.text)
        assertEquals(listOf("Oui", "Non"), dto.answer?.questions?.single()?.choices)
        assertEquals("Valider le devis", Proposals.factTasks(dto.facts)["abc123"]?.name)
        assertEquals(monday.plusDays(1), Proposals.factTasks(dto.facts)["abc123"]?.due)
        assertNull(dto.days)
    }

    @Test
    fun `the days of the sheet come from the server when it sends them, else from the facts`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(
            """
            {
              "uid": "p3", "kind": "week", "status": "ready",
              "days": [
                { "date": "2026-11-17", "load_minutes": 30, "capacity_minutes": 630,
                  "items": [{ "task_uid": "abc123", "name": "Classer la déclaration", "minutes": 30 }],
                  "events": [{ "title": "Foire aux livres", "start": "13:30", "end": "14:30", "all_day": false }],
                  "work": { "start": "07:30", "end": "18:00", "label": "Dentsply" } },
                { "date": "2026-11-18", "load_minutes": 0, "capacity_minutes": 0,
                  "events": [{ "title": "Congé", "all_day": true }] }
              ],
              "facts": { "days": [{ "date": "2026-11-16", "load_minutes": 45, "planned": ["abc123"] }] }
            }
            """.trimIndent(),
        )

        val loads = Proposals.dayLoads(dto.days, dto.facts)

        assertEquals(listOf(tuesday, wednesday), loads.map { it.date })
        assertEquals(630, loads[0].capacityMinutes)
        assertEquals("Dentsply", loads[0].work?.label)
        assertEquals("Classer la déclaration", loads[0].items.single().name)
        assertFalse(loads[0].occupied)
        assertTrue(loads[1].occupied)
        assertTrue(loads[1].full)
        assertEquals(1f, loads[1].fill)
        assertEquals(listOf(monday), Proposals.dayLoads(null, dto.facts).map { it.date })
        assertEquals(45, Proposals.dayLoads(null, dto.facts).single().loadMinutes)
    }

    @Test
    fun `a day fills its bar by its load over its capacity and is full when the load reaches it`() {
        val half = DayLoad(monday, loadMinutes = 240, capacityMinutes = 480, items = emptyList(), events = emptyList(), work = null)
        val unknown = DayLoad(monday, loadMinutes = 240, capacityMinutes = null, items = emptyList(), events = emptyList(), work = null)
        val reached = DayLoad(monday, loadMinutes = 480, capacityMinutes = 480, items = emptyList(), events = emptyList(), work = null)

        assertEquals(0.5f, half.fill)
        assertFalse(half.full)
        assertEquals(0.5f, unknown.fill)
        assertTrue(reached.full)
    }

    @Test
    fun `next week and month decisions are kept from the answer and sent without a date`() {
        val answer = ProposalJson.decodeFromString<ProposalDto>(
            """
            {
              "uid": "p2", "kind": "week", "status": "ready",
              "answer": { "changes": [
                { "task_uid": "a", "op": "next_week", "reason": "Pas urgent" },
                { "task_uid": "b", "op": "this_month", "reason": "Ce mois" },
                { "task_uid": "c", "op": "next_month", "reason": "Plus tard ce mois" }
              ] }
            }
            """.trimIndent(),
        ).answer
        val changes = Proposals.weekChanges(answer)

        assertEquals(listOf(ProposalOp.NEXT_WEEK, ProposalOp.THIS_MONTH, ProposalOp.NEXT_MONTH), changes.map { it.op })
        assertEquals(listOf(null, null, null), changes.map { it.date })

        val body = Proposals.sendBody(changes, emptyMap(), emptyMap())["decisions"]!!.jsonArray.map { it.jsonObject }

        assertEquals(listOf("a", "b", "c"), body.map { it["task_uid"]!!.jsonPrimitive.content })
        assertEquals(listOf("next_week", "this_month", "next_month"), body.map { it["op"]!!.jsonPrimitive.content })
        assertEquals(listOf(false, false, false), body.map { it.containsKey("date") })
    }

    @Test
    fun `every task of the facts is a row, a task without a change keeps its place and is kept`() {
        val tasks = tasksOf(task("a"), task("b"), task("c"))
        val changes = listOf(change("c", ProposalOp.DROP), change("zzz", ProposalOp.LATER))

        val rows = Proposals.weekRows(tasks, changes)

        assertEquals(listOf("a", "b", "c"), rows.map { it.taskUid })
        assertEquals(listOf(ProposalOp.KEEP, ProposalOp.KEEP, ProposalOp.DROP), rows.map { it.op })
    }

    @Test
    fun `without facts the answer's changes are the rows`() {
        val changes = listOf(change("a", ProposalOp.LATER))

        assertEquals(changes, Proposals.weekRows(emptyMap(), changes))
    }

    @Test
    fun `overdue tasks come first whatever their decision, then the days, then the rest`() {
        val tasks = tasksOf(
            task("a"),
            task("b", overdue = true),
            task("c", overdue = true),
            task("d"),
            task("e"),
            task("f"),
        )
        val rows = Proposals.weekRows(tasks, listOf(
            change("a", ProposalOp.PLAN_DAY, tuesday),
            change("b", ProposalOp.PLAN_DAY, monday),
            change("c", ProposalOp.KEEP),
            change("d", ProposalOp.LATER),
            change("e", ProposalOp.DROP),
        ))

        val sections = Proposals.sections(rows, emptyMap(), tasks)

        assertEquals(listOf(SheetSection.OVERDUE, SheetSection.DAYS, SheetSection.LATER), sections.map { it.section })
        assertEquals(listOf("b", "c"), sections[0].changes.map { it.taskUid })
        assertEquals(listOf("a"), sections[1].changes.map { it.taskUid })
        assertEquals(listOf("d", "e", "f"), sections[2].changes.map { it.taskUid })
    }

    @Test
    fun `a chosen day moves a row into the days section`() {
        val tasks = tasksOf(task("a"), task("b"))
        val rows = Proposals.weekRows(tasks, listOf(change("a", ProposalOp.LATER), change("b", ProposalOp.THIS_WEEK)))
        val chosen = Proposals.choose(emptyMap(), rows[0], WeekDecision(ProposalOp.PLAN_DAY, tuesday))

        val sections = Proposals.sections(rows, chosen, tasks)

        assertEquals(listOf(SheetSection.DAYS, SheetSection.LATER), sections.map { it.section })
        assertEquals(WeekDecision(ProposalOp.LATER), Proposals.decision(rows[0], emptyMap()))
    }

    @Test
    fun `lateness counts the days since the due date, and is absent when not overdue`() {
        val yesterday = task("a", due = monday.minusDays(1), overdue = true)

        assertEquals(1, Proposals.lateness(yesterday, monday))
        assertEquals(5, Proposals.lateness(task("b", due = monday.minusDays(5), overdue = true), monday))
        assertNull(Proposals.lateness(task("c", due = monday.minusDays(5)), monday))
        assertNull(Proposals.lateness(yesterday, null))
    }

    @Test
    fun `the footer counts the changes, the kept rows and the returned rows, a noted row counts once`() {
        val rows = listOf(
            change("a", ProposalOp.LATER),
            change("b", ProposalOp.DROP),
            change("c", ProposalOp.KEEP),
            change("d", ProposalOp.THIS_WEEK),
        )

        assertEquals(WeekCounts(changes = 3, kept = 1, returned = 0), Proposals.counts(rows, emptyMap(), emptyMap()))
        assertEquals(
            WeekCounts(changes = 2, kept = 1, returned = 1),
            Proposals.counts(rows, emptyMap(), mapOf("b" to "Non, garde-la")),
        )
    }

    @Test
    fun `the agent's decision stays in the answer when the user chooses another`() {
        val change = change("a", ProposalOp.LATER)
        val chosen = Proposals.choose(emptyMap(), change, WeekDecision(ProposalOp.PLAN_DAY, tuesday))

        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, tuesday), Proposals.decision(change, chosen))
        assertEquals(WeekDecision(ProposalOp.LATER), Proposals.decision(change, emptyMap()))
    }

    @Test
    fun `a choice is modified until it equals the agent's suggestion, then restore gives it back`() {
        val change = change("a", ProposalOp.PLAN_DAY, monday)

        val other = Proposals.choose(emptyMap(), change, WeekDecision(ProposalOp.DROP))
        assertTrue(Proposals.isModified(change, other))
        assertEquals(WeekDecision(ProposalOp.DROP), Proposals.decision(change, other))

        val back = Proposals.choose(other, change, WeekDecision(ProposalOp.PLAN_DAY, monday))
        assertFalse(Proposals.isModified(change, back))
        assertTrue(back.isEmpty())

        assertEquals(WeekDecision(ProposalOp.PLAN_DAY, monday), Proposals.decision(change, Proposals.restore(other, "a")))
    }

    @Test
    fun `apply body sends each decision with its op and date and leaves out keep`() {
        val changes = listOf(
            change("a", ProposalOp.PLAN_DAY, monday),
            change("b", ProposalOp.KEEP),
            change("c", ProposalOp.THIS_WEEK),
            change("d", ProposalOp.DUE, tuesday),
        )
        val chosen = Proposals.choose(emptyMap(), changes[2], WeekDecision(ProposalOp.KEEP))

        val decisions = Proposals.weekApplyBody(changes, chosen)["decisions"]!!.jsonArray.map { it.jsonObject }

        assertEquals(listOf("a", "d"), decisions.map { it["task_uid"]!!.jsonPrimitive.content })
        assertEquals("plan_day", decisions[0]["op"]!!.jsonPrimitive.content)
        assertEquals("2026-11-16", decisions[0]["date"]!!.jsonPrimitive.content)
        assertEquals("due", decisions[1]["op"]!!.jsonPrimitive.content)
        assertEquals(2, Proposals.pendingCount(changes, chosen))
    }

    @Test
    fun `send body leaves out noted rows and keep, and carries the trimmed notes`() {
        val changes = listOf(
            change("a", ProposalOp.PLAN_DAY, monday),
            change("b", ProposalOp.LATER),
            change("c", ProposalOp.KEEP),
            change("d", ProposalOp.DUE, tuesday),
        )
        val notes = mapOf("b" to "  Trop tard pour ça  ", "d" to "Plutôt jeudi")

        val body = Proposals.sendBody(changes, emptyMap(), notes)
        val decisions = body["decisions"]!!.jsonArray.map { it.jsonObject }
        val sentNotes = body["notes"]!!.jsonArray.map { it.jsonObject }

        assertEquals(listOf("a"), decisions.map { it["task_uid"]!!.jsonPrimitive.content })
        assertEquals(listOf("b", "d"), sentNotes.map { it["task_uid"]!!.jsonPrimitive.content })
        assertEquals("Trop tard pour ça", sentNotes[0]["text"]!!.jsonPrimitive.content)
        assertEquals("Plutôt jeudi", sentNotes[1]["text"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a blank note is no note, so its row keeps its decision and is applied`() {
        val changes = listOf(change("a", ProposalOp.THIS_WEEK))
        val notes = mapOf("a" to "   ")

        assertFalse(Proposals.hasNote(changes[0], notes))
        assertEquals(listOf("a"), Proposals.sendBody(changes, emptyMap(), notes)["decisions"]!!.jsonArray.map {
            it.jsonObject["task_uid"]!!.jsonPrimitive.content
        })
        assertEquals(0, Proposals.sendBody(changes, emptyMap(), notes)["notes"]!!.jsonArray.size)
    }

    @Test
    fun `notes of tasks that are not in the answer are not sent`() {
        val changes = listOf(change("a", ProposalOp.LATER))

        val body = Proposals.sendBody(changes, emptyMap(), mapOf("zzz" to "Hors réponse"))

        assertEquals(0, body["notes"]!!.jsonArray.size)
        assertEquals(1, body["decisions"]!!.jsonArray.size)
    }

    @Test
    fun `a question choice is staged, changed by another choice and cleared by the same one`() {
        val answered = Proposals.chooseAnswer(emptyMap(), "q1", "Oui")
        assertEquals(mapOf("q1" to "Oui"), answered)
        assertEquals(mapOf("q1" to "Non"), Proposals.chooseAnswer(answered, "q1", "Non"))
        assertEquals(emptyMap<String, String>(), Proposals.chooseAnswer(answered, "q1", "Oui"))
    }

    @Test
    fun `send body carries the answers next to the decisions and the notes`() {
        val changes = listOf(change("a", ProposalOp.LATER), change("b", ProposalOp.DUE, tuesday))
        val body = Proposals.sendBody(changes, emptyMap(), mapOf("b" to "Plutôt jeudi"), mapOf("q1" to "Non"))

        assertEquals(listOf("a"), body["decisions"]!!.jsonArray.map { it.jsonObject["task_uid"]!!.jsonPrimitive.content })
        assertEquals(1, body["notes"]!!.jsonArray.size)
        val answer = body["answers"]!!.jsonArray.single().jsonObject
        assertEquals("q1", answer["question_id"]!!.jsonPrimitive.content)
        assertEquals("Non", answer["choice"]!!.jsonPrimitive.content)
    }

    @Test
    fun `send is needed when a question is answered or a row is noted, apply otherwise`() {
        val none = WeekCounts(changes = 2, kept = 0, returned = 0)
        assertFalse(Proposals.needsSend(none, emptyMap()))
        assertTrue(Proposals.needsSend(none, mapOf("q1" to "Oui")))
        assertTrue(Proposals.needsSend(WeekCounts(changes = 0, kept = 0, returned = 1), emptyMap()))
    }

    @Test
    fun `the focus day of a row is its planned day, else the first day of the period`() {
        val period = monday to monday.plusDays(6)

        assertEquals(tuesday, Proposals.focusDay(WeekDecision(ProposalOp.PLAN_DAY, tuesday), period))
        assertEquals(monday, Proposals.focusDay(WeekDecision(ProposalOp.LATER), period))
        assertNull(Proposals.focusDay(WeekDecision(ProposalOp.LATER), null))
    }

    @Test
    fun `the apply button counts the decisions that are not keep`() {
        val changes = listOf(change("a", ProposalOp.LATER), change("b", ProposalOp.KEEP))

        assertEquals(1, Proposals.pendingCount(changes, emptyMap()))
        assertEquals(0, Proposals.pendingCount(changes, Proposals.choose(emptyMap(), changes[0], WeekDecision(ProposalOp.KEEP))))
    }

    @Test
    fun `the menu offers each day of the period, then this week, next week, this month, next month, later, keep and drop`() {
        val options = Proposals.menuOptions(monday, monday.plusDays(6))

        assertEquals((0..6).map { WeekDecision(ProposalOp.PLAN_DAY, monday.plusDays(it.toLong())) }, options.take(7))
        assertEquals(
            listOf(
                WeekDecision(ProposalOp.THIS_WEEK),
                WeekDecision(ProposalOp.NEXT_WEEK),
                WeekDecision(ProposalOp.THIS_MONTH),
                WeekDecision(ProposalOp.NEXT_MONTH),
                WeekDecision(ProposalOp.LATER),
                WeekDecision(ProposalOp.KEEP),
                WeekDecision(ProposalOp.DROP),
            ),
            options.drop(7),
        )
        assertEquals(7, Proposals.menuOptions(null, null).size)
        assertEquals(7, Proposals.menuOptions(tuesday, monday).size)
    }

    @Test
    fun `the headline is the answer's headline, and a legacy summary becomes the subtitle`() {
        val v2 = ProposalAnswerDto(headline = "Mardi est libre", subtitle = "Deux retards replacés.", summary = "ancien")
        val legacy = ProposalAnswerDto(summary = "Mardi est libre ; deux retards replacés.")

        assertEquals("Mardi est libre", Proposals.headlineOf(v2))
        assertEquals("Deux retards replacés.", Proposals.subtitleOf(v2))
        assertNull(Proposals.headlineOf(legacy))
        assertEquals("Mardi est libre ; deux retards replacés.", Proposals.subtitleOf(legacy))
        assertNull(Proposals.subtitleOf(ProposalAnswerDto(headline = "Seul")))
    }

    @Test
    fun `a week answer without a date is dropped when its operation needs one`() {
        val answer = ProposalAnswerDto(
            changes = listOf(
                ChangeDto(taskUid = "a", op = "plan_day"),
                ChangeDto(taskUid = "b", op = "due", date = "2026-11-18"),
                ChangeDto(taskUid = "c", op = "keep", reason = "Déjà bien"),
            ),
        )

        assertEquals(listOf("b", "c"), Proposals.weekChanges(answer).map { it.taskUid })
    }

    @Test
    fun `task facts give the due date and the overdue flag, and the day's date comes from facts today`() {
        val facts = ProposalJson.parseToJsonElement(
            """{"today":"2026-11-16","tasks":[{"uid":"a","name":"Valider","due":"2026-11-15","overdue":true},{"uid":"b","name":"Lire"}]}""",
        ).jsonObject

        val tasks = Proposals.factTasks(facts)

        assertEquals(FactTask("a", "Valider", monday.minusDays(1), overdue = true), tasks["a"])
        assertEquals(FactTask("b", "Lire", null, overdue = false), tasks["b"])
        assertEquals(monday, Proposals.factToday(facts))
    }

    @Test
    fun `review judgements map each task to its choice and reason`() {
        val answer = ProposalAnswerDto(
            items = listOf(
                ReviewItemDto(taskUid = "a", choice = "do_today", reason = "Échéance demain"),
                ReviewItemDto(taskUid = "", choice = "later"),
                ReviewItemDto(taskUid = "b", choice = ""),
            ),
        )

        val judgements = Proposals.reviewJudgements(answer)

        assertEquals(mapOf("a" to ReviewJudgement("a", "do_today", "Échéance demain")), judgements)
    }

    @Test
    fun `judgements are used only for a ready or partly applied review`() {
        val items = ProposalAnswerDto(items = listOf(ReviewItemDto(taskUid = "a", choice = "drop", reason = "Plus d'actualité")))

        assertEquals(1, Proposals.judgementsOf(review("ready", items)).size)
        assertEquals(1, Proposals.judgementsOf(review("applied", items)).size)
        assertTrue(Proposals.judgementsOf(review("pending", items)).isEmpty())
        assertTrue(Proposals.judgementsOf(review("failed", items)).isEmpty())
        assertTrue(Proposals.judgementsOf(null).isEmpty())
    }

    @Test
    fun `review apply body sends one decision per task`() {
        val body = Proposals.reviewApplyBody(listOf(ReviewJudgement("a", "keep", "")))

        val decision = body["decisions"]!!.jsonArray.single().jsonObject
        assertEquals("a", decision["task_uid"]!!.jsonPrimitive.content)
        assertEquals("keep", decision["choice"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a question choice is sent as the question followed by the choice`() {
        val question = QuestionDto(id = "q1", text = " Tu travailles mardi ? ", choices = listOf("Oui"))

        assertEquals("Tu travailles mardi ? Oui", Proposals.questionReply(question, "Oui"))
    }

    @Test
    fun `the button follows the latest proposal and returns to idle after a failure`() {
        assertEquals(ProposalPhase.Idle, ProposalPhase.of(null))
        assertEquals(ProposalPhase.Preparing("p1"), ProposalPhase.of(proposal("pending")))
        assertEquals(ProposalPhase.Ready("p1"), ProposalPhase.of(proposal("ready")))
        assertEquals(ProposalPhase.Idle, ProposalPhase.of(proposal("failed")))
        assertEquals(ProposalPhase.Idle, ProposalPhase.of(proposal("applied")))
    }

    @Test
    fun `apply outcome counts applied and failed changes`() {
        val body = ProposalJson.decodeFromString<kotlinx.serialization.json.JsonObject>(
            """{"uid":"p1","status":"applied","results":[{"task_uid":"a","state":"applied"},{"task_uid":"b","state":"failed","error":"x"},{"task_uid":"c","state":"applied"}]}""",
        )

        assertEquals(ApplyOutcome(applied = 2, failed = 1), Proposals.applyOutcome(body))
    }

    @Test
    fun `an unknown kind or status is not a proposal the app shows`() {
        assertNull(ProposalKind.of("weekly"))
        assertNull(ProposalStatus.of("stuck"))
        assertEquals(ProposalStatus.READY, ProposalStatus.of("ready"))
    }

    @Test
    fun `a finished week opens the sheet, a failed one opens Planifier, a pending one notifies nothing`() {
        assertEquals(ProposalNotifications.ROUTE_SHOW, ProposalNotifications.present("week", "ready")?.route)
        assertEquals(ProposalNotifications.ROUTE_PLAN, ProposalNotifications.present("week", "failed")?.route)
        assertEquals(ProposalNotifications.ROUTE_REVIEW, ProposalNotifications.present("review", "ready")?.route)
        assertNull(ProposalNotifications.present("week", "pending"))
    }

    private fun proposal(status: String) = ProposalDto(uid = "p1", kind = "week", status = status)

    private fun review(status: String, answer: ProposalAnswerDto) = ProposalDto(uid = "r1", kind = "review", status = status, answer = answer)
}
