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
    fun `parses the documented week answer and facts`() {
        val dto = ProposalJson.decodeFromString<ProposalDto>(weekJson)

        assertEquals("ready", dto.status)
        assertEquals("Mardi est libre ; deux retards replacés.", dto.answer?.summary)
        assertEquals("Tu travailles mardi ?", dto.answer?.questions?.single()?.text)
        assertEquals(listOf("Oui", "Non"), dto.answer?.questions?.single()?.choices)
        assertEquals("Valider le devis", Proposals.factTasks(dto.facts)["abc123"]?.name)
        assertEquals("Cuisine", Proposals.factTasks(dto.facts)["abc123"]?.project)
    }

    @Test
    fun `sections follow the current decision, days first then this week later due drop keep`() {
        val changes = listOf(
            change("a", ProposalOp.DROP),
            change("b", ProposalOp.KEEP),
            change("c", ProposalOp.PLAN_DAY, tuesday),
            change("d", ProposalOp.LATER),
            change("e", ProposalOp.THIS_WEEK),
            change("f", ProposalOp.PLAN_DAY, monday),
            change("g", ProposalOp.DUE, wednesday),
        )

        val sections = Proposals.sections(changes, emptyMap())

        assertEquals(
            listOf<DecisionGroup>(
                DecisionGroup.Day(monday),
                DecisionGroup.Day(tuesday),
                DecisionGroup.ThisWeek,
                DecisionGroup.Later,
                DecisionGroup.Due(wednesday),
                DecisionGroup.Drop,
                DecisionGroup.Keep,
            ),
            sections.map { it.group },
        )
        assertEquals(listOf("f"), sections[0].changes.map { it.taskUid })
    }

    @Test
    fun `a chosen decision moves the row to its new group and the agent's stays in the answer`() {
        val changes = listOf(change("a", ProposalOp.LATER), change("b", ProposalOp.THIS_WEEK))
        val chosen = Proposals.choose(emptyMap(), changes[0], WeekDecision(ProposalOp.PLAN_DAY, tuesday))

        val sections = Proposals.sections(changes, chosen)

        assertEquals(listOf<DecisionGroup>(DecisionGroup.Day(tuesday), DecisionGroup.ThisWeek), sections.map { it.group })
        assertEquals(WeekDecision(ProposalOp.LATER), Proposals.decision(changes[0], emptyMap()))
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
    fun `send counts give the applied and returned rows, keep rows are neither`() {
        val changes = listOf(
            change("a", ProposalOp.LATER),
            change("b", ProposalOp.DROP),
            change("c", ProposalOp.KEEP),
            change("d", ProposalOp.THIS_WEEK),
        )
        val notes = mapOf("b" to "Non, garde-la")

        assertEquals(SendCounts(applied = 2, returned = 1), Proposals.sendCounts(changes, emptyMap(), notes))
        assertEquals(SendCounts(applied = 3, returned = 0), Proposals.sendCounts(changes, emptyMap(), emptyMap()))
    }

    @Test
    fun `the apply button counts the decisions that are not keep`() {
        val changes = listOf(change("a", ProposalOp.LATER), change("b", ProposalOp.KEEP))

        assertEquals(1, Proposals.pendingCount(changes, emptyMap()))
        assertEquals(0, Proposals.pendingCount(changes, Proposals.choose(emptyMap(), changes[0], WeekDecision(ProposalOp.KEEP))))
    }

    @Test
    fun `the menu offers each day of the period, then this week, later, keep and drop`() {
        val options = Proposals.menuOptions(monday, monday.plusDays(6))

        assertEquals((0..6).map { WeekDecision(ProposalOp.PLAN_DAY, monday.plusDays(it.toLong())) }, options.take(7))
        assertEquals(
            listOf(WeekDecision(ProposalOp.THIS_WEEK), WeekDecision(ProposalOp.LATER), WeekDecision(ProposalOp.KEEP), WeekDecision(ProposalOp.DROP)),
            options.drop(7),
        )
        assertEquals(4, Proposals.menuOptions(null, null).size)
        assertEquals(4, Proposals.menuOptions(tuesday, monday).size)
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
    fun `task facts keep their goal and area`() {
        val facts = ProposalJson.parseToJsonElement(
            """{"tasks":[{"uid":"a","name":"Valider","goal":"Cuisine rénovée","area":"Maison"},{"uid":"b","name":"Lire"}]}""",
        ).jsonObject

        val tasks = Proposals.factTasks(facts)

        assertEquals("Cuisine rénovée", tasks["a"]?.goal)
        assertEquals("Maison", tasks["a"]?.area)
        assertNull(tasks["b"]?.goal)
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
